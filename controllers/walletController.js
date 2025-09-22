// RUTA: backend/controllers/walletController.js (VERSIÓN "NEXUS - UNIFIED TRANSACTION LOGGING")

const mongoose = require('mongoose');
const User = require('../models/userModel');
const Setting = require('../models/settingsModel');
const { createTransaction } = require('../utils/transactionLogger');
const asyncHandler = require('express-async-handler');

const startMining = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    res.status(404);
    throw new Error('Usuario no encontrado.');
  }
  if (user.miningStatus !== 'IDLE') {
    res.status(400);
    throw new Error('El ciclo de minado ya está activo o completado.');
  }
  user.miningStatus = 'MINING';
  user.lastMiningClaim = new Date();
  await user.save();
  
  const updatedUser = await User.findById(req.user.id).populate('activeTools.tool');
  res.status(200).json({
    message: '¡Ciclo de minado iniciado!',
    user: updatedUser.toObject(),
  });
});

const claim = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    res.status(404);
    throw new Error('Usuario no encontrado.');
  }
  
  const now = new Date();
  const lastClaim = new Date(user.lastMiningClaim);
  const MINING_CYCLE_DURATION_MS = 24 * 60 * 60 * 1000;
  const timePassed = now.getTime() - lastClaim.getTime();

  if (user.miningStatus === 'MINING' && timePassed < MINING_CYCLE_DURATION_MS) {
    res.status(400);
    throw new Error('El ciclo de minado de 24 horas aún no ha terminado.');
  }

  const earnedNtx = user.effectiveMiningRate;
  
  if (earnedNtx <= 0) {
      res.status(400);
      throw new Error('No hay ganancias para reclamar.');
  }

  user.balance.ntx = (user.balance.ntx || 0) + earnedNtx;
  user.miningStatus = 'IDLE';
  
  await createTransaction(req.user.id, 'mining_claim', earnedNtx, 'NTX', 'Reclamo de ciclo de minería');
  await user.save();

  const updatedUser = await User.findById(req.user.id).populate('activeTools.tool');
  res.json({
    message: `¡Has reclamado ${earnedNtx.toFixed(2)} NTX!`,
    user: updatedUser.toObject(),
  });
});

const swapNtxToUsdt = asyncHandler(async (req, res) => {
  const { ntxAmount } = req.body;
  const userId = req.user.id;
  const SWAP_RATE = 10000; // 1 USDT = 10,000 NTX

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const settings = await Setting.findOne({ singleton: 'global_settings' }).session(session);
    if (!settings) {
      throw new Error('La configuración del sistema no está disponible.');
    }
    
    const numericNtxAmount = parseFloat(ntxAmount);
    if (isNaN(numericNtxAmount) || numericNtxAmount < settings.minimumSwap) {
      res.status(400);
      throw new Error(`La cantidad mínima para intercambiar es ${settings.minimumSwap.toLocaleString()} NTX.`);
    }

    const user = await User.findById(userId).session(session);
    if (!user || (user.balance.ntx || 0) < numericNtxAmount) {
      res.status(400);
      throw new Error('Saldo NTX insuficiente.');
    }

    const feeAmount = numericNtxAmount * (settings.swapFeePercent / 100);
    const amountAfterFee = numericNtxAmount - feeAmount;
    const usdtToReceive = amountAfterFee / SWAP_RATE;

    user.balance.ntx -= numericNtxAmount;
    user.balance.usdt += usdtToReceive;
    
    // [NEXUS AUDIT FIX] - INICIO DE LA CORRECCIÓN
    // Se elimina la llamada al array obsoleto user.transactions.push()
    // y se reemplaza por una llamada al logger centralizado.
    await createTransaction(
        userId,
        'swap_ntx_to_usdt',
        usdtToReceive,
        'USDT',
        `Intercambio de ${numericNtxAmount.toLocaleString()} NTX`,
        { ntxAmount: numericNtxAmount.toString(), feeAmount: feeAmount.toString() },
        session
    );
    // [NEXUS AUDIT FIX] - FIN DE LA CORRECCIÓN

    await user.save({ session });
    await session.commitTransaction();
    
    const updatedUser = await User.findById(userId).populate('activeTools.tool');
    res.status(200).json({ message: `¡Intercambio exitoso!`, user: updatedUser.toObject() });
  } catch (error) {
    await session.abortTransaction();
    throw error; // Dejamos que el errorHandler lo capture.
  } finally {
    session.endSession();
  }
});

const requestWithdrawal = asyncHandler(async (req, res) => {
  const { amount, walletAddress } = req.body;
  const userId = req.user.id;
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const settings = await Setting.findOne({ singleton: 'global_settings' }).session(session);
    if (!settings) {
        throw new Error('La configuración del sistema no está disponible.');
    }
    
    if (!settings.withdrawalsEnabled) {
        res.status(403);
        throw new Error('Los retiros están deshabilitados temporalmente. Por favor, intente más tarde.');
    }

    const numericAmount = parseFloat(amount);
    
    if (isNaN(numericAmount) || numericAmount < settings.minimumWithdrawal) {
      res.status(400);
      throw new Error(`El retiro mínimo es ${settings.minimumWithdrawal} USDT.`);
    }
    
    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      res.status(400);
      throw new Error('La dirección de billetera (BEP20) es inválida.');
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
        res.status(404);
        throw new Error('Usuario no encontrado.');
    }
    if ((user.balance.usdt || 0) < numericAmount) {
      res.status(400);
      throw new Error('Saldo USDT insuficiente.');
    }

    user.balance.usdt -= numericAmount;
    
    const feeAmount = numericAmount * (settings.withdrawalFeePercent / 100);
    const netAmount = numericAmount - feeAmount;
    
    // [NEXUS AUDIT FIX] - INICIO DE LA CORRECCIÓN
    // Se elimina la llamada al array obsoleto user.transactions.push()
    // y se reemplaza por una llamada al logger centralizado.
    // Creamos la transacción con estado 'pending' en la colección global.
    const newTransaction = new Transaction({
        user: userId,
        type: 'withdrawal',
        status: 'pending',
        amount: -numericAmount,
        currency: 'USDT',
        description: `Solicitud de retiro a ${walletAddress}`,
        metadata: { 
            walletAddress, 
            network: 'USDT-BEP20', 
            feePercent: settings.withdrawalFeePercent.toString(), 
            feeAmount: feeAmount.toFixed(4), 
            netAmount: netAmount.toFixed(4) 
        }
    });
    await newTransaction.save({ session });
    // [NEXUS AUDIT FIX] - FIN DE LA CORRECCIÓN

    await user.save({ session });
    await session.commitTransaction();
    
    const updatedUser = await User.findById(userId).populate('activeTools.tool');
    res.status(201).json({ 
      message: 'Tu solicitud de retiro ha sido enviada con éxito y está pendiente de revisión.', 
      user: updatedUser.toObject()
    });

  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

// [DEPRECATED] - Esta función ahora es obsoleta. La nueva lógica residirá en userController.
const getHistory = asyncHandler(async (req, res) => {
    const transactions = (req.user.transactions || []).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 50);
    res.json(transactions);
});

module.exports = {
  startMining,
  claim,
  swapNtxToUsdt,
  requestWithdrawal,
  getHistory,
};