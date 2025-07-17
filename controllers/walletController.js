// backend/controllers/walletController.js (VERSIÓN v17.0 - ESTABILIZADA)

const axios = require('axios');
const crypto = require('crypto');
const https = require('https-proxy-agent');
const mongoose = require('mongoose');
const User = require('../models/userModel');
const Tool = require('../models/toolModel');
const Transaction = require('../models/transactionModel');
const Setting = require('../models/settingsModel');
const { createTransaction } = require('../utils/transactionLogger');
const { distributeCommissions } = require('../services/commissionService');

const CRYPTO_CLOUD_API_URL = 'https://api.cryptocloud.pro/v2';
const SHOP_ID = process.env.CRYPTO_CLOUD_SHOP_ID;
const API_KEY = process.env.CRYPTO_CLOUD_API_KEY;
const SECRET_KEY = process.env.CRYPTO_CLOUD_SECRET_KEY;

// --- FUNCIONES EXISTENTES (SIN CAMBIOS) ---
const startMining = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
    if (user.miningStatus !== 'IDLE') {
      return res.status(400).json({ message: 'El ciclo de minado ya está activo o completado.' });
    }
    user.miningStatus = 'MINING';
    user.lastMiningClaim = new Date();
    await user.save();
    const updatedUser = await User.findById(req.user.id).populate('activeTools.tool');
    res.status(200).json({
      message: '¡Ciclo de minado iniciado!',
      user: updatedUser.toObject(),
    });
  } catch (error) {
    console.error('Error en startMining:', error);
    res.status(500).json({ message: 'Error interno al iniciar el ciclo de minado.' });
  }
};

const createDirectDeposit = async (req, res) => {
  const { toolId, currency } = req.body;
  const userId = req.user.id;
  if (!toolId || !currency) return res.status(400).json({ message: 'Se requiere la herramienta y la moneda.' });
  try {
    const tool = await Tool.findById(toolId);
    if (!tool) return res.status(404).json({ message: 'Herramienta no encontrada.' });
    const totalCostUSDT = tool.price;
    const order_id = `purchase_${userId}_${toolId}_1_${Date.now()}`;
    const payload = { shop_id: SHOP_ID, amount: totalCostUSDT.toFixed(2), currency, order_id };
    const agent = process.env.HTTP_PROXY ? new https.Agent(process.env.HTTP_PROXY) : undefined;
    const axiosOptions = { headers: { 'Authorization': `Token ${API_KEY}` }, httpsAgent: agent };
    const response = await axios.post(`${CRYPTO_CLOUD_API_URL}/invoice/create`, payload, axiosOptions);
    const { status, result } = response.data;
    if (status !== 'success') return res.status(500).json({ message: 'Error al generar la dirección de pago.' });
    res.json({ paymentAddress: result.pay_url, paymentAmount: result.amount, currency: result.currency });
  } catch (error) {
    console.error('Error detallado en createDirectDeposit:', { message: error.message, requestBody: req.body, responseData: error.response?.data });
    res.status(500).json({ message: 'Error interno al generar la dirección de pago.' });
  }
};

const createPurchaseInvoice = async (req, res) => {
  const { toolId, quantity } = req.body;
  const userId = req.user.id;
  if (!toolId || !quantity || quantity <= 0) return res.status(400).json({ message: 'Datos de compra inválidos.' });
  try {
    const tool = await Tool.findById(toolId);
    if (!tool) return res.status(404).json({ message: 'Herramienta no encontrada.' });
    const totalCostUSDT = tool.price * quantity;
    const order_id = `purchase_${userId}_${toolId}_${quantity}_${Date.now()}`;
    const payload = { shop_id: SHOP_ID, amount: totalCostUSDT.toFixed(2), currency: 'USDT', order_id };
    const agent = process.env.HTTP_PROXY ? new https.Agent(process.env.HTTP_PROXY) : undefined;
    const axiosOptions = { headers: { 'Authorization': `Token ${API_KEY}` }, httpsAgent: agent };
    const response = await axios.post(`${CRYPTO_CLOUD_API_URL}/invoice/create`, payload, axiosOptions);
    res.json(response.data.result);
  } catch (error) {
    console.error('Error en createPurchaseInvoice:', error.response?.data || error.message);
    res.status(500).json({ message: 'Error interno al generar la factura.' });
  }
};

const createDepositInvoice = async (req, res) => {
  const { amount } = req.body;
  const userId = req.user.id;
  if (!amount || typeof amount !== 'number' || amount <= 0) return res.status(400).json({ message: 'La cantidad debe ser un número positivo.' });
  try {
    const order_id = `deposit_${userId}_${Date.now()}`;
    const payload = { shop_id: SHOP_ID, amount: parseFloat(amount).toFixed(2), currency: 'USDT', order_id };
    const agent = process.env.HTTP_PROXY ? new https.Agent(process.env.HTTP_PROXY) : undefined;
    const axiosOptions = { headers: { 'Authorization': `Token ${API_KEY}` }, httpsAgent: agent };
    const response = await axios.post(`${CRYPTO_CLOUD_API_URL}/invoice/create`, payload, axiosOptions);
    res.json(response.data.result);
  } catch (error) {
    console.error('Error al crear factura de depósito:', error.response?.data || error.message);
    res.status(500).json({ message: 'Error al generar la dirección de depósito.' });
  }
};

const purchaseWithBalance = async (req, res) => {
  const { toolId, quantity } = req.body;
  const userId = req.user.id;
  if (!toolId || !quantity || quantity <= 0) {
    return res.status(400).json({ message: 'Datos de compra inválidos.' });
  }
  // NOTA: Esta función también debería usar una transacción o la lógica de mitigación.
  // Se abordará en la Prioridad 2 para mantener el enfoque.
  try {
    const tool = await Tool.findById(toolId);
    if (!tool) return res.status(404).json({ message: 'La herramienta no existe.' });
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
    const totalCost = tool.price * quantity;
    if (user.balance.usdt < totalCost) {
      return res.status(400).json({ message: 'Saldo USDT insuficiente.' });
    }
    const now = new Date();
    user.balance.usdt -= totalCost;
    const expiryDate = new Date(now.getTime() + tool.durationDays * 24 * 60 * 60 * 1000);
    for (let i = 0; i < quantity; i++) {
      user.activeTools.push({ tool: tool._id, purchaseDate: now, expiryDate: expiryDate });
    }
    await user.save();
    await createTransaction(userId, 'purchase', totalCost, 'USDT', `Compra de ${quantity}x ${tool.name}`);
    await distributeCommissions(user, totalCost);
    const finalUpdatedUser = await User.findById(userId).populate('activeTools.tool');
    res.status(200).json({ message: `¡Compra de ${quantity}x ${tool.name} exitosa!`, user: finalUpdatedUser.toObject() });
  } catch (error) {
    console.error('Error en purchaseWithBalance:', error);
    res.status(500).json({ message: 'Error al procesar la compra.' });
  }
};

const cryptoCloudWebhook = async (req, res) => {
  const signature = req.headers['crypto-cloud-signature'];
  const payload = req.body;
  if (!signature) return res.status(400).send('Signature header missing');
  try {
    const sign = crypto.createHmac('sha256', SECRET_KEY).update(JSON.stringify(payload)).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(sign))) {
      return res.status(400).send('Invalid signature');
    }
    if (payload.status === 'paid') {
      const order_id = payload.order_id;
      const amountPaid = parseFloat(payload.amount_usdt);
      if (order_id.startsWith('purchase_')) {
        const [, userId, toolId, quantityStr] = order_id.split('_');
        const quantity = parseInt(quantityStr, 10);
        const user = await User.findById(userId);
        const tool = await Tool.findById(toolId);
        if (user && tool) {
          const now = new Date();
          const expiryDate = new Date(now.getTime() + tool.durationDays * 24 * 60 * 60 * 1000);
          for (let i = 0; i < quantity; i++) {
            user.activeTools.push({ tool: tool._id, purchaseDate: now, expiryDate: expiryDate });
          }
          await user.save();
          await createTransaction(userId, 'purchase', amountPaid, 'USDT', `Compra de ${quantity}x ${tool.name} (Crypto)`);
          await distributeCommissions(user, amountPaid);
        }
      } else if (order_id.startsWith('deposit_')) {
        const [, userId] = order_id.split('_');
        await User.findByIdAndUpdate(userId, { $inc: { 'balance.usdt': amountPaid } });
        await createTransaction(userId, 'deposit', amountPaid, 'USDT', 'Depósito vía CryptoCloud');
      }
    }
    res.status(200).send('Webhook processed');
  } catch (error) {
    console.error('Error procesando el webhook:', error);
    res.status(500).send('Server error processing webhook');
  }
};

const MINING_CYCLE_DURATION_MS = 24 * 60 * 60 * 1000;

const claim = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
    const now = new Date();
    const lastClaim = new Date(user.lastMiningClaim);
    const timePassed = now.getTime() - lastClaim.getTime();
    if (timePassed < MINING_CYCLE_DURATION_MS) {
      return res.status(400).json({ message: 'El ciclo de minado de 24 horas aún no ha terminado.' });
    }
    const earnedNtx = user.effectiveMiningRate;
    user.balance.ntx += earnedNtx;
    user.miningStatus = 'IDLE';
    await user.save();
    await createTransaction(req.user.id, 'mining_claim', earnedNtx, 'NTX', 'Reclamo de ciclo de minería');
    const updatedUser = await User.findById(req.user.id).populate('activeTools.tool');
    res.json({
      message: `¡Has reclamado ${earnedNtx.toFixed(2)} NTX!`,
      user: updatedUser.toObject(),
    });
  } catch (error) {
    console.error("Error al reclamar las ganancias:", error);
    res.status(500).json({ message: "Error del servidor al procesar el reclamo." });
  }
};

const swapNtxToUsdt = async (req, res) => {
    // Esta función ya usa una transacción. Mantenemos este código asumiendo que
    // el problema del replica set se resolverá. Si no, necesitará la misma refactorización.
  const { ntxAmount } = req.body;
  const userId = req.user.id;
  const SWAP_RATE = 10000;
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const settings = await Setting.findOne({ singleton: 'global_settings' }).session(session);
    if (!settings) throw new Error('La configuración del sistema no está disponible.');
    const numericNtxAmount = parseFloat(ntxAmount);
    if (!numericNtxAmount || numericNtxAmount < settings.minimumSwap) {
      return res.status(400).json({ message: `La cantidad mínima para intercambiar es ${settings.minimumSwap.toLocaleString()} NTX.` });
    }
    const user = await User.findById(userId).session(session);
    if (!user || user.balance.ntx < numericNtxAmount) {
      return res.status(400).json({ message: 'Saldo NTX insuficiente.' });
    }
    const feeAmount = numericNtxAmount * (settings.swapFeePercent / 100);
    const amountAfterFee = numericNtxAmount - feeAmount;
    const usdtToReceive = amountAfterFee / SWAP_RATE;
    user.balance.ntx -= numericNtxAmount;
    user.balance.usdt += usdtToReceive;
    await createTransaction(userId, 'swap_ntx_to_usdt', numericNtxAmount, 'NTX', `Intercambio a ${usdtToReceive.toFixed(4)} USDT`, session);
    await user.save({ session });
    await session.commitTransaction();
    const updatedUser = await User.findById(userId).populate('activeTools.tool');
    res.status(200).json({ message: `¡Intercambio exitoso!`, user: updatedUser.toObject() });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error en swapNtxToUsdt:', error);
    res.status(500).json({ message: error.message || 'Error interno al procesar el intercambio.' });
  } finally {
    session.endSession();
  }
};

// ===================================================================================
// =================== INICIO DE LA FUNCIÓN CORREGIDA Y ESTABILIZADA ===================
// ===================================================================================
const requestWithdrawal = async (req, res) => {
  const { amount, walletAddress } = req.body;
  const userId = req.user.id;

  // Ya no usamos session, ya que no podemos garantizar que el entorno la soporte.
  // const session = await mongoose.startSession();

  let withdrawalTransaction; // La declaramos fuera para poder acceder a ella en el catch

  try {
    // --- PASO 1: VALIDACIONES PREVIAS ---
    // Hacemos todas las lecturas y validaciones antes de cualquier escritura.
    const settings = await Setting.findOne({ singleton: 'global_settings' });
    if (!settings) {
      // Usamos `throw new Error` para que el catch general lo maneje y loguee.
      throw new Error('La configuración del sistema no está disponible.');
    }

    const numericAmount = parseFloat(amount);
    if (!numericAmount || numericAmount < settings.minimumWithdrawal) {
      return res.status(400).json({ message: `El retiro mínimo es ${settings.minimumWithdrawal} USDT.` });
    }

    if (!walletAddress) {
      return res.status(400).json({ message: 'La dirección de billetera es requerida.' });
    }

    const user = await User.findById(userId);
    if (!user) {
        return res.status(404).json({ message: 'Usuario no encontrado.' });
    }
    if (user.balance.usdt < numericAmount) {
      return res.status(400).json({ message: 'Saldo USDT insuficiente.' });
    }

    // --- PASO 2: CREAR EL REGISTRO DE LA TRANSACCIÓN PRIMERO (NUESTRO "SEGURO") ---
    // Si esta operación falla, no se descuenta nada al usuario.
    const feeAmount = numericAmount * (settings.withdrawalFeePercent / 100);
    const netAmount = numericAmount - feeAmount;

    withdrawalTransaction = new Transaction({
      user: userId,
      type: 'withdrawal',
      status: 'pending', // Nace como 'pending'
      amount: numericAmount,
      currency: 'USDT',
      description: `Solicitud de retiro a ${walletAddress}`,
      metadata: {
        walletAddress,
        network: 'USDT-BEP20', // Como lo envía el frontend
        feePercent: settings.withdrawalFeePercent.toString(),
        feeAmount: feeAmount.toFixed(4),
        netAmount: netAmount.toFixed(4),
      }
    });
    await withdrawalTransaction.save(); // Guardamos el registro

    // --- PASO 3: DESCONTAR EL SALDO DEL USUARIO ---
    // Esta es la segunda operación. Si falla, tenemos el registro para auditar.
    try {
      user.balance.usdt -= numericAmount;
      await user.save();
    } catch (userSaveError) {
      // ¡CRÍTICO! Si falla el guardado del usuario, marcamos la transacción como fallida.
      console.error('Error al guardar el usuario después de crear la transacción de retiro. Revirtiendo estado de transacción.', userSaveError);
      
      withdrawalTransaction.status = 'failed';
      withdrawalTransaction.metadata.set('error', 'Fallo al actualizar el saldo del usuario post-creación.');
      await withdrawalTransaction.save();
      
      // Lanzamos el error para que el catch principal lo maneje.
      throw new Error('No se pudo actualizar el saldo del usuario. La solicitud de retiro fue anulada.');
    }

    // --- PASO 4: ÉXITO ---
    // Ambas operaciones fueron exitosas. Devolvemos la respuesta al usuario.
    const updatedUser = await User.findById(userId).populate('activeTools.tool');
    res.status(201).json({ 
      message: 'Tu solicitud de retiro ha sido enviada con éxito y está pendiente de revisión.', 
      user: updatedUser.toObject() 
    });

  } catch (error) {
    // Catch general para cualquier otro error (ej: fallo de conexión a DB, error en `settings`, etc.)
    console.error('Error catastrófico en requestWithdrawal:', error);
    res.status(500).json({ message: error.message || 'Error interno al procesar la solicitud.' });
  }
  // No necesitamos `finally` porque ya no manejamos la sesión.
};
// ===================================================================================
// ==================== FIN DE LA FUNCIÓN CORREGIDA Y ESTABILIZADA =====================
// ===================================================================================

const getHistory = async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(50);
    res.json(transactions);
  } catch (error) {
    console.error('Error en getHistory:', error);
    res.status(500).json({ message: 'Error al obtener el historial.' });
  }
};

module.exports = {
  startMining,
  createDirectDeposit,
  createPurchaseInvoice,
  purchaseWithBalance,
  createDepositInvoice,
  cryptoCloudWebhook,
  claim,
  swapNtxToUsdt,
  requestWithdrawal,
  getHistory,
};