// backend/controllers/walletController.js (VERSIÓN COMPLETA CON DEPÓSITO DIRECTO Y RESET)

const axios = require('axios');
const crypto =require('crypto');
const https = require('https');
const User = require('../models/userModel');
const Tool = require('../models/toolModel');
const WithdrawalRequest = require('../models/withdrawalRequestModel');
const Transaction = require('../models/transactionModel');
const { createTransaction } = require('../utils/transactionLogger');

const CRYPTO_CLOUD_API_URL = 'https://api.cryptocloud.pro/v2';
const SHOP_ID = process.env.CRYPTO_CLOUD_SHOP_ID;
const API_KEY = process.env.CRYPTO_CLOUD_API_KEY;
const SECRET_KEY = process.env.CRYPTO_CLOUD_SECRET_KEY;

// --- INICIO DE LA NUEVA FUNCIÓN (TAREA 18.1) ---
const createDirectDeposit = async (req, res) => {
   console.log('Recibida petición para createDirectDeposit con body:', req.body);
  const { toolId, currency } = req.body; // Recibimos la moneda elegida por el usuario
  const userId = req.user.id;

  if (!toolId || !currency) {
    return res.status(400).json({ message: 'Se requiere la herramienta y la moneda.' });
  }

  try {
    const tool = await Tool.findById(toolId);
    if (!tool) return res.status(404).json({ message: 'Herramienta no encontrada.' });

    const totalCostUSDT = tool.price; // Asumimos quantity = 1 para este flujo
    const order_id = `purchase_${userId}_${toolId}_1_${Date.now()}`;
    
    const payload = {
      shop_id: SHOP_ID,
      amount: totalCostUSDT.toFixed(2), // El monto base siempre es en USDT
      currency, // AQUI LA MAGIA: especificamos la crypto en la que se pagará
      order_id: order_id,
    };

    const axiosOptions = {
      headers: { 'Authorization': `Token ${API_KEY}` },
    };
    if (process.env.NODE_ENV === 'development') {
      axiosOptions.httpsAgent = new https.Agent({ rejectUnauthorized: false });
    }
    
    // Llamamos a la API de CryptoCloud
    const response = await axios.post(`${CRYPTO_CLOUD_API_URL}/invoice/create`, payload, axiosOptions);
    
    const { status, result } = response.data;
    if (status !== 'success') {
      return res.status(500).json({ message: 'Error al generar la dirección de pago.' });
    }

    // Devolvemos al frontend solo la información que necesita para el modal de depósito
    res.json({
      paymentAddress: result.pay_url,   // La dirección de la wallet
      paymentAmount: result.amount,       // La cantidad exacta en la crypto elegida
      currency: result.currency,        // La crypto elegida
    });

  } catch (error) {
    // CORRECCIÓN: Mejoramos el log de errores para capturar toda la información relevante
    console.error('Error detallado en createDirectDeposit:', {
      message: error.message,
      stack: error.stack,
      requestBody: req.body,
      responseData: error.response?.data,
    });
    res.status(500).json({ message: 'Error interno al generar la dirección de pago.' });
      }
};
// --- FIN DE LA NUEVA FUNCIÓN ---


// --- 1. CREAR FACTURA DE COMPRA (OBSOLETA, PERO SE CONSERVA) ---
const createPurchaseInvoice = async (req, res) => {
  const { toolId, quantity } = req.body;
  const userId = req.user.id;

  if (!toolId || !quantity || quantity <= 0) {
    return res.status(400).json({ message: 'Datos de compra inválidos.' });
  }

  try {
    const tool = await Tool.findById(toolId);
    if (!tool) return res.status(404).json({ message: 'Herramienta no encontrada.' });

    const totalCostUSDT = tool.price * quantity;
    const order_id = `purchase_${userId}_${toolId}_${quantity}_${Date.now()}`;
    
    const payload = {
      shop_id: SHOP_ID,
      amount: totalCostUSDT.toFixed(2),
      currency: 'USDT',
      order_id: order_id,
    };

    const axiosOptions = {
      headers: { 'Authorization': `Token ${API_KEY}` },
    };
    if (process.env.NODE_ENV === 'development') {
      axiosOptions.httpsAgent = new https.Agent({ rejectUnauthorized: false });
    }
    
    const response = await axios.post(`${CRYPTO_CLOUD_API_URL}/invoice/create`, payload, axiosOptions);
    res.json(response.data.result);

  } catch (error) {
    console.error('Error en createPurchaseInvoice:', error.response?.data || error.message);
    res.status(500).json({ message: 'Error interno al generar la factura.' });
  }
};

// --- 2. COMPRAR HERRAMIENTA CON SALDO INTERNO (CON RESET) ---
const purchaseWithBalance = async (req, res) => {
  const { toolId, quantity } = req.body;
  const userId = req.user.id;

  if (!toolId || !quantity || quantity <= 0) {
    return res.status(400).json({ message: 'Datos de compra inválidos.' });
  }

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
    
    user.lastMiningClaim = now; // Reseteamos el contador de minado

    await user.save();

    await createTransaction(userId, 'purchase', totalCost, 'USDT', `Compra de ${quantity}x ${tool.name}`);
    await distributeCommissions(userId);

    const finalUpdatedUser = await User.findById(userId).populate('activeTools.tool');
    res.status(200).json({
      message: `¡Compra de ${quantity}x ${tool.name} exitosa!`,
      user: finalUpdatedUser.toObject(),
    });
  } catch (error) {
    console.error('Error en purchaseWithBalance:', error);
    res.status(500).json({ message: 'Error al procesar la compra.' });
  }
};


// --- 3. CREAR FACTURA DE DEPÓSITO DE SALDO ---
const createDepositInvoice = async (req, res) => {
  const { amount } = req.body;
  const userId = req.user.id;

  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ message: 'La cantidad debe ser un número positivo.' });
  }

  try {
    const order_id = `deposit_${userId}_${Date.now()}`;
    const payload = {
      shop_id: SHOP_ID,
      amount: parseFloat(amount).toFixed(2),
      currency: 'USDT',
      order_id: order_id,
    };

    const axiosOptions = {
      headers: { 'Authorization': `Token ${API_KEY}` },
    };
    if (process.env.NODE_ENV === 'development') {
      axiosOptions.httpsAgent = new https.Agent({ rejectUnauthorized: false });
    }
    
    const response = await axios.post(`${CRYPTO_CLOUD_API_URL}/invoice/create`, payload, axiosOptions);
    res.json(response.data.result);
  } catch (error) {
    console.error('Error al crear factura de depósito:', error.response?.data || error.message);
    res.status(500).json({ message: 'Error al generar la dirección de depósito.' });
  }
};


// --- 4. WEBHOOK DE CRYPTOCLOUD (CON RESET) ---
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

      if (order_id.startsWith('purchase_')) {
        const [, userId, toolId, quantityStr] = order_id.split('_');
        const quantity = parseInt(quantityStr, 10);
        const amountPaid = parseFloat(payload.amount_usdt);
        const user = await User.findById(userId);
        const tool = await Tool.findById(toolId);
        
        if (user && tool) {
          const now = new Date();
          const expiryDate = new Date(now.getTime() + tool.durationDays * 24 * 60 * 60 * 1000);
          for (let i = 0; i < quantity; i++) {
            user.activeTools.push({ tool: tool._id, purchaseDate: now, expiryDate: expiryDate });
          }
          
          user.lastMiningClaim = now; // Reseteamos el contador de minado

          await user.save();
          await createTransaction(userId, 'purchase', amountPaid, 'USDT', `Compra de ${quantity}x ${tool.name} (Crypto)`);
          await distributeCommissions(userId);
        }
      } else if (order_id.startsWith('deposit_')) {
        const [, userId] = order_id.split('_');
        const amountCredited = parseFloat(payload.amount_usdt);
        const user = await User.findById(userId);
        if (user && amountCredited > 0) {
          user.balance.usdt += amountCredited;
          await user.save();
          await createTransaction(userId, 'deposit', amountCredited, 'USDT', 'Depósito vía CryptoCloud');
        }
      }
    }
    res.status(200).send('Webhook processed');
  } catch (error) {
    console.error('Error procesando el webhook:', error);
    res.status(500).send('Server error processing webhook');
  }
};

// --- 5. RECLAMAR GANANCIAS DE MINERÍA ---
const claimMiningRewards = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('activeTools.tool');
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
    
    const now = new Date();
    const lastClaim = new Date(user.lastMiningClaim);
    const secondsPassed = (now.getTime() - lastClaim.getTime()) / 1000;
    
    if (secondsPassed <= 1) return res.status(400).json({ message: 'No hay ganancias para reclamar.' });
    
    const earnedNtx = (user.effectiveMiningRate / 3600) * secondsPassed;
    if (earnedNtx <= 0.00001) return res.status(400).json({ message: 'Ganancias insuficientes para reclamar.' });

    user.balance.ntx += earnedNtx;
    user.lastMiningClaim = now;
    await user.save();

    await createTransaction(req.user.id, 'mining_claim', earnedNtx, 'NTX', 'Reclamo de minería');

    res.json({
      message: `¡Has reclamado ${earnedNtx.toFixed(4)} NTX!`,
      user: user.toObject(),
    });
  } catch (error) {
    console.error("Error al reclamar las ganancias:", error);
    res.status(500).json({ message: "Error del servidor al procesar el reclamo." });
  }
};

// --- 6. DISTRIBUIR COMISIONES ---
const distributeCommissions = async (buyerId) => {
  try {
    const commissionRates = { 1: 0.25, 2: 0.15, 3: 0.05 };
    let currentUser = await User.findById(buyerId).populate('referredBy');
    
    for (let level = 1; level <= 3; level++) {
      if (!currentUser?.referredBy) break;

      const referrer = currentUser.referredBy;
      const commissionAmount = commissionRates[level];
      referrer.balance.usdt += commissionAmount;
      await referrer.save();

      await createTransaction(referrer._id, 'referral_commission', commissionAmount, 'USDT', `Comisión Nivel ${level} por referido ${currentUser.username}`);
      
      currentUser = await User.findById(referrer._id).populate('referredBy');
    }
  } catch (error) {
    console.error(`Error en distributeCommissions para ${buyerId}:`, error);
  }
};

// --- 7. INTERCAMBIAR NTX A USDT (SWAP) ---
const swapNtxToUsdt = async (req, res) => {
  const { ntxAmount } = req.body;
  const userId = req.user.id;
  const SWAP_RATE = 10000;
  const MINIMUM_NTX_SWAP = 1.5 * SWAP_RATE;

  if (!ntxAmount || typeof ntxAmount !== 'number' || ntxAmount < MINIMUM_NTX_SWAP) {
    return res.status(400).json({ message: `La cantidad mínima para intercambiar es ${MINIMUM_NTX_SWAP} NTX.` });
  }

  try {
    const user = await User.findById(userId);
    if (!user || user.balance.ntx < ntxAmount) {
      return res.status(400).json({ message: 'Saldo NTX insuficiente.' });
    }

    const usdtToReceive = ntxAmount / SWAP_RATE;
    user.balance.ntx -= ntxAmount;
    user.balance.usdt += usdtToReceive;
    await user.save();

    await createTransaction(userId, 'swap_ntx_to_usdt', ntxAmount, 'NTX', `Intercambio a ${usdtToReceive.toFixed(2)} USDT`);
    
    const updatedUser = await User.findById(userId).populate('activeTools.tool');
    res.status(200).json({
      message: `¡Intercambio exitoso!`,
      user: updatedUser.toObject()
    });
  } catch (error) {
    console.error('Error en swapNtxToUsdt:', error);
    res.status(500).json({ message: 'Error interno al procesar el intercambio.' });
  }
};

// --- 8. SOLICITAR UN RETIRO DE USDT ---
const requestWithdrawal = async (req, res) => {
  const { amount, network, walletAddress } = req.body;
  const userId = req.user.id;
  const MINIMUM_WITHDRAWAL = 1.0;

  if (!amount || typeof amount !== 'number' || amount < MINIMUM_WITHDRAWAL) {
    return res.status(400).json({ message: `El retiro mínimo es ${MINIMUM_WITHDRAWAL} USDT.` });
  }
  if (!network || !walletAddress) {
    return res.status(400).json({ message: 'La red y la dirección de billetera son requeridas.' });
  }

  try {
    const user = await User.findById(userId);
    if (!user || user.balance.usdt < amount) {
      return res.status(400).json({ message: 'Saldo USDT insuficiente.' });
    }

    user.balance.usdt -= amount;
    await user.save();

    await createTransaction(userId, 'withdrawal', amount, 'USDT', `Solicitud de retiro a ${walletAddress} (${network})`);

    const newRequest = new WithdrawalRequest({ user: userId, amount, network, walletAddress, status: 'pending' });
    await newRequest.save();
    
    const updatedUser = await User.findById(userId).populate('activeTools.tool');
    res.status(201).json({
      message: 'Tu solicitud de retiro ha sido enviada con éxito.',
      user: updatedUser.toObject()
    });
  } catch (error) {
    console.error('Error en requestWithdrawal:', error);
    res.status(500).json({ message: 'Error interno al procesar la solicitud.' });
  }
};

// --- 9. OBTENER HISTORIAL DE TRANSACCIONES ---
const getHistory = async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user.id })
                                          .sort({ createdAt: -1 })
                                          .limit(50);
    res.json(transactions);
  } catch (error) {
    console.error('Error en getHistory:', error);
    res.status(500).json({ message: 'Error al obtener el historial.' });
  }
};

// --- EXPORTACIÓN DE TODOS LOS CONTROLADORES ---
module.exports = {
  createDirectDeposit,
  createPurchaseInvoice,
  purchaseWithBalance,
  createDepositInvoice,
  cryptoCloudWebhook,
  claimMiningRewards,
  swapNtxToUsdt,
  requestWithdrawal,
  getHistory,
};