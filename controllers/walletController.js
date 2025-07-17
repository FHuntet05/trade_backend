// backend/controllers/walletController.js (VERSIÓN v17.3 - COMPRA AUTOMÁTICA)
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
const { sendTelegramMessage } = require('../services/notificationService');
const { fulfillPurchase } = require('../services/toolPurchaseService');

const CRYPTO_CLOUD_API_URL = 'https://api.cryptocloud.pro/v2';
const SHOP_ID = process.env.CRYPTO_CLOUD_SHOP_ID;
const API_KEY = process.env.CRYPTO_CLOUD_API_KEY;
const SECRET_KEY = process.env.CRYPTO_CLOUD_SECRET_KEY;

const createDepositInvoice = async (req, res) => {
  const { amount, toolId, quantity, currency } = req.body;
  const userId = req.user.id;
  try {
    let order_id;
    let finalAmount;
    if (toolId && quantity) {
      const tool = await Tool.findById(toolId);
      if (!tool) return res.status(404).json({ message: 'Herramienta no encontrada.' });
      finalAmount = tool.price * quantity;
      order_id = `dfp_${userId}_${toolId}_${quantity}_${Date.now()}`;
    } else {
      if (!amount || typeof amount !== 'number' || amount <= 0) return res.status(400).json({ message: 'La cantidad debe ser un número positivo.' });
      finalAmount = amount;
      order_id = `deposit_${userId}_${Date.now()}`;
    }
    const payload = { shop_id: SHOP_ID, amount: parseFloat(finalAmount).toFixed(2), currency, order_id };
    const agent = process.env.HTTP_PROXY ? new https.Agent(process.env.HTTP_PROXY) : undefined;
    const axiosOptions = { headers: { 'Authorization': `Token ${API_KEY}` }, httpsAgent: agent };
    const response = await axios.post(`${CRYPTO_CLOUD_API_URL}/invoice/create`, payload, axiosOptions);
    res.json(response.data.result);
  } catch (error) {
    console.error('Error al crear factura de depósito/compra:', error.response?.data || error.message);
    res.status(500).json({ message: 'Error al generar la dirección de pago.' });
  }
};

const purchaseWithBalance = async (req, res) => {
  const { toolId, quantity } = req.body;
  const userId = req.user.id;
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    await fulfillPurchase(userId, toolId, quantity, session);
    await session.commitTransaction();
    const finalUpdatedUser = await User.findById(userId).populate('activeTools.tool');
    const tool = await Tool.findById(toolId);
    res.status(200).json({ message: `¡Compra de ${quantity}x ${tool.name} exitosa!`, user: finalUpdatedUser.toObject() });
  } catch (error) {
    await session.abortTransaction();
    console.error('Error en purchaseWithBalance:', error);
    res.status(500).json({ message: error.message || 'Error al procesar la compra.' });
  } finally {
    session.endSession();
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
            if (order_id.startsWith('dfp_')) {
                const [, userId, toolId, quantityStr] = order_id.split('_');
                const quantity = parseInt(quantityStr, 10);
                const session = await mongoose.startSession();
                try {
                    session.startTransaction();
                    const user = await User.findById(userId).session(session);
                    const tool = await Tool.findById(toolId).session(session);
                    if (!user || !tool) throw new Error(`Usuario o Herramienta no encontrado en webhook dfp.`);
                    user.balance.usdt += amountPaid;
                    await user.save({ session });
                    await createTransaction(userId, 'deposit', amountPaid, 'USDT', `Depósito para compra de ${quantity}x ${tool.name}`, session);
                    await fulfillPurchase(userId, toolId, quantity, session);
                    await session.commitTransaction();
                    const successMessage = `✅ <b>¡Compra Automática Exitosa!</b>\n\n` + `Tu depósito de <b>${amountPaid.toFixed(2)} USDT</b> fue recibido y ` + `la compra de <b>${quantity}x ${tool.name}</b> se ha completado automáticamente.`;
                    await sendTelegramMessage(user.telegramId, successMessage);
                } catch (webhookError) {
                    await session.abortTransaction();
                    console.error('Error procesando webhook DFP:', webhookError);
                } finally {
                    session.endSession();
                }
            } else if (order_id.startsWith('deposit_')) {
                const [, userId] = order_id.split('_');
                const user = await User.findByIdAndUpdate(userId, { $inc: { 'balance.usdt': amountPaid } }, { new: true });
                await createTransaction(userId, 'deposit', amountPaid, 'USDT', 'Depósito vía CryptoCloud');
                const successMessage = `✅ <b>¡Depósito Recibido!</b>\n\n` + `Hemos acreditado <b>${amountPaid.toFixed(2)} USDT</b> a tu saldo.`;
                if(user) await sendTelegramMessage(user.telegramId, successMessage);
            }
        }
        res.status(200).send('Webhook processed');
    } catch (error) {
        console.error('Error catastrófico procesando el webhook:', error);
        res.status(500).send('Server error processing webhook');
    }
};

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
    res.status(200).json({ message: '¡Ciclo de minado iniciado!', user: updatedUser.toObject() });
  } catch (error) {
    console.error('Error en startMining:', error);
    res.status(500).json({ message: 'Error interno al iniciar el ciclo de minado.' });
  }
};

const claim = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
    const now = new Date();
    const lastClaim = new Date(user.lastMiningClaim);
    if (now.getTime() - lastClaim.getTime() < 24 * 60 * 60 * 1000) {
      return res.status(400).json({ message: 'El ciclo de minado de 24 horas aún no ha terminado.' });
    }
    const earnedNtx = user.effectiveMiningRate;
    user.balance.ntx += earnedNtx;
    user.miningStatus = 'IDLE';
    await user.save();
    await createTransaction(req.user.id, 'mining_claim', earnedNtx, 'NTX', 'Reclamo de ciclo de minería');
    const updatedUser = await User.findById(req.user.id).populate('activeTools.tool');
    res.json({ message: `¡Has reclamado ${earnedNtx.toFixed(2)} NTX!`, user: updatedUser.toObject() });
  } catch (error) {
    console.error("Error al reclamar las ganancias:", error);
    res.status(500).json({ message: "Error del servidor al procesar el reclamo." });
  }
};

const swapNtxToUsdt = async (req, res) => {
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
      return res.status(400).json({ message: `La cantidad mínima para intercambiar es ${settings.minimumSwap} NTX.` });
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

const requestWithdrawal = async (req, res) => {
  const { amount, walletAddress } = req.body;
  const userId = req.user.id;
  let withdrawalTransaction;
  try {
    const settings = await Setting.findOne({ singleton: 'global_settings' });
    if (!settings) throw new Error('La configuración del sistema no está disponible.');
    const numericAmount = parseFloat(amount);
    if (!numericAmount || numericAmount < settings.minimumWithdrawal) {
      return res.status(400).json({ message: `El retiro mínimo es ${settings.minimumWithdrawal} USDT.` });
    }
    if (!walletAddress) { return res.status(400).json({ message: 'La dirección de billetera es requerida.' });}
    const user = await User.findById(userId);
    if (!user) { return res.status(404).json({ message: 'Usuario no encontrado.' }); }
    if (user.balance.usdt < numericAmount) { return res.status(400).json({ message: 'Saldo USDT insuficiente.' }); }
    const feeAmount = numericAmount * (settings.withdrawalFeePercent / 100);
    const netAmount = numericAmount - feeAmount;
    withdrawalTransaction = new Transaction({ user: userId, type: 'withdrawal', status: 'pending', amount: numericAmount, currency: 'USDT', description: `Solicitud de retiro a ${walletAddress}`, metadata: { walletAddress, network: 'USDT-BEP20', feePercent: settings.withdrawalFeePercent.toString(), feeAmount: feeAmount.toFixed(4), netAmount: netAmount.toFixed(4) } });
    await withdrawalTransaction.save();
    try {
      user.balance.usdt -= numericAmount;
      await user.save();
    } catch (userSaveError) {
      console.error('Error al guardar el usuario después de crear la transacción de retiro.', userSaveError);
      withdrawalTransaction.status = 'failed';
      withdrawalTransaction.metadata.set('error', 'Fallo al actualizar el saldo del usuario post-creación.');
      await withdrawalTransaction.save();
      throw new Error('No se pudo actualizar el saldo del usuario. La solicitud de retiro fue anulada.');
    }
    await user.populate('activeTools.tool');
    res.status(201).json({ message: 'Tu solicitud de retiro ha sido enviada con éxito y está pendiente de revisión.', user: user.toObject() });
  } catch (error) {
    console.error('Error catastrófico en requestWithdrawal:', error);
    res.status(500).json({ message: error.message || 'Error interno al procesar la solicitud.' });
  }
};

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
  purchaseWithBalance,
  createDepositInvoice,
  cryptoCloudWebhook,
  claim,
  swapNtxToUsdt,
  requestWithdrawal,
  getHistory,
};