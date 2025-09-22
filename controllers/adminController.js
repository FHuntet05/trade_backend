// RUTA: backend/controllers/adminController.js (VERSIÓN "NEXUS - ENHANCED SEARCH FIX")
const User = require('../models/userModel');
const Factory = require('../models/toolModel');
const Setting =require('../models/settingsModel');
const CryptoWallet = require('../models/cryptoWalletModel');
const mongoose = require('mongoose');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { getTemporaryPhotoUrl } = require('./userController');
const asyncHandler = require('express-async-handler');
const { sendTelegramMessage } = require('../services/notificationService');
const transactionService = require('../services/transactionService');
const gasEstimatorService = require('../services/gasEstimatorService');
const { ethers } = require('ethers');
const PendingTx = require('../models/pendingTxModel');
const qrCodeToDataURLPromise = require('util').promisify(QRCode.toDataURL);
const crypto = require('crypto');
const blockchainService = require('../services/blockchainService');
const Transaction = require('../models/transactionModel');

// --- Constantes y Helpers (sin cambios) ---
const PLACEHOLDER_AVATAR_URL = 'https://i.postimg.cc/mD21B6r7/user-avatar-placeholder.png';
const USDT_BSC_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const USDT_ABI = ['function balanceOf(address) view returns (uint256)'];

async function _getBalancesForAddress(address, chain) {
  if (chain !== 'BSC') { throw new Error(`Cadena no soportada: ${chain}. Solo se procesa BSC.`); }
  try {
    const usdtBscContract = new ethers.Contract(USDT_BSC_ADDRESS, USDT_ABI, blockchainService.provider);
    const [usdtBalanceRaw, bnbBalanceRaw] = await Promise.all([
      promiseWithTimeout(usdtBscContract.balanceOf(address), 15000),
      promiseWithTimeout(blockchainService.getBnbBalance(address), 15000)
    ]);
    return {
      usdt: parseFloat(ethers.utils.formatUnits(usdtBalanceRaw, 18)),
      bnb: parseFloat(ethers.utils.formatEther(bnbBalanceRaw))
    };
  } catch (error) {
    console.error(`Error al obtener saldo para ${address} en ${chain}:`, error);
    throw new Error(`Fallo al escanear ${address}. Causa: ${error.message}`);
  }
}
function promiseWithTimeout(promise, ms, timeoutMessage = 'Operación excedió el tiempo de espera.') {
  const timeout = new Promise((_, reject) => {
    const id = setTimeout(() => { clearTimeout(id); reject(new Error(timeoutMessage)); }, ms);
  });
  return Promise.race([promise, timeout]);
}

// --- Endpoints del Dashboard (sin cambios) ---
const getDashboardStats = asyncHandler(async (req, res) => {
  const totalDepositVolumePromise = Transaction.aggregate([ { $match: { type: 'deposit', status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } } ]);
  const pendingWithdrawalsPromise = Transaction.countDocuments({ type: 'withdrawal', status: 'pending' });
  const userGrowthDataPromise = User.aggregate([ { $match: { createdAt: { $gte: new Date(new Date().setDate(new Date().getDate() - 14)) } } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } } ]).then(data => data.map(item => ({ date: item._id, NuevosUsuarios: item.count })));
  const totalUsersPromise = User.countDocuments();
  const centralWalletBalancesPromise = (async () => { try { const { bscWallet } = transactionService.getCentralWallets(); const balances = await _getBalancesForAddress(bscWallet.address, 'BSC'); return { usdt: balances.usdt, bnb: balances.bnb }; } catch (error) { console.error("Error al obtener balance de billetera central:", error); return { usdt: 0, bnb: 0 }; } })();
  const [ totalUsers, totalDepositVolumeResult, pendingWithdrawals, centralWalletBalances, userGrowthData ] = await Promise.all([ totalUsersPromise, totalDepositVolumePromise, pendingWithdrawalsPromise, centralWalletBalancesPromise, userGrowthDataPromise ]);
  const totalDepositVolume = totalDepositVolumeResult.length > 0 ? totalDepositVolumeResult[0].total : 0;
  res.json({ totalUsers, totalDepositVolume, pendingWithdrawals, centralWalletBalances, userGrowthData });
});

// --- Gestión de Retiros (sin cambios) ---
const getPendingWithdrawals = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const aggregationPipeline = [ { $match: { 'transactions.type': 'withdrawal', 'transactions.status': 'pending' } }, { $unwind: '$transactions' }, { $match: { 'transactions.type': 'withdrawal', 'transactions.status': 'pending' } }, { $sort: { 'transactions.createdAt': -1 } }, { $project: { _id: '$transactions._id', grossAmount: { $abs: '$transactions.amount' }, feeAmount: { $ifNull: [ { $toDouble: '$transactions.metadata.feeAmount' }, 0 ] }, netAmount: { $ifNull: [ { $toDouble: '$transactions.metadata.netAmount' }, 0 ] }, walletAddress: '$transactions.metadata.walletAddress', currency: '$transactions.currency', status: '$transactions.status', createdAt: '$transactions.createdAt', user: { _id: '$_id', username: '$username', telegramId: '$telegramId', photoFileId: '$photoFileId' } } } ];
  const countPipeline = [...aggregationPipeline, { $count: 'total' }];
  const paginatedPipeline = [...aggregationPipeline, { $skip: (page - 1) * limit }, { $limit: limit }];
  const [totalResult, paginatedItems] = await Promise.all([ User.aggregate(countPipeline), User.aggregate(paginatedPipeline) ]);
  const total = totalResult.length > 0 ? totalResult[0].total : 0;
  if (total === 0) return res.json({ withdrawals: [], page: 1, pages: 0, total: 0 });
  const withdrawalsWithDetails = await Promise.all(paginatedItems.map(async (w) => { const photoUrl = await getTemporaryPhotoUrl(w.user.photoFileId); return { ...w, user: { ...w.user, photoUrl: photoUrl || PLACEHOLDER_AVATAR_URL } }; }));
  res.json({ withdrawals: withdrawalsWithDetails, page, pages: Math.ceil(total / limit), total });
});

const processWithdrawal = asyncHandler(async (req, res) => {
  const { status, adminNotes } = req.body;
  const { id: transactionId } = req.params;
  if (!['completed', 'rejected'].includes(status)) { res.status(400); throw new Error("El estado debe ser 'completed' o 'rejected'."); }
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const user = await User.findOne({ 'transactions._id': transactionId, 'transactions.status': 'pending' }).session(session);
    if (!user) throw new Error('Retiro no encontrado o ya ha sido procesado.');
    const withdrawal = user.transactions.id(transactionId);
    let notificationMessage = '';
    if (status === 'completed') {
      withdrawal.status = 'completed';
      withdrawal.description = `Retiro completado por el administrador.`;
      notificationMessage = `✅ <b>¡Retiro Aprobado!</b>\n\nTu solicitud de retiro por <b>${Math.abs(withdrawal.amount)} USDT</b> ha sido aprobada.`;
    } else {
      user.balance.usdt += Math.abs(withdrawal.amount);
      withdrawal.status = 'rejected';
      withdrawal.description = `Retiro rechazado. Fondos devueltos al saldo.`;
      notificationMessage = `❌ <b>Retiro Rechazado</b>\n\nTu solicitud de retiro por <b>${Math.abs(withdrawal.amount)} USDT</b> ha sido rechazada.\n\n<b>Motivo:</b> ${adminNotes || 'Contacta a soporte.'}`;
    }
    withdrawal.metadata.adminNotes = adminNotes || 'N/A';
    withdrawal.metadata.processedBy = req.user.username;
    await user.save({ session });
    await session.commitTransaction();
    if (user.telegramId && notificationMessage) { await sendTelegramMessage(user.telegramId, notificationMessage); }
    res.json({ message: `Retiro marcado como '${status}' exitosamente.`, withdrawal });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ message: error.message || "Error del servidor al procesar el retiro." });
  } finally {
    session.endSession();
  }
});

// --- Gestión de Usuarios ---
// [NEXUS ENHANCED SEARCH] - INICIO DE LA CORRECCIÓN
const getAllUsers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const search = req.query.search || '';
  
  let query = {};
  if (search) {
    const searchRegex = { $regex: search, $options: 'i' };
    // La consulta ahora busca en el username O en el telegramId.
    query.$or = [
        { username: searchRegex },
        { telegramId: searchRegex }
    ];
  }

  const totalUsers = await User.countDocuments(query);
  const users = await User.find(query)
      .select('-password')
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
      
  const usersWithPhoto = await Promise.all(users.map(async (user) => {
    const photoUrl = await getTemporaryPhotoUrl(user.photoFileId);
    return { ...user, photoUrl: photoUrl || PLACEHOLDER_AVATAR_URL };
  }));
  
  res.json({ 
    users: usersWithPhoto, 
    pagination: { 
        currentPage: page, 
        totalPages: Math.ceil(totalUsers / limit), 
        totalUsers 
    } 
  });
});
// [NEXUS ENHANCED SEARCH] - FIN DE LA CORRECCIÓN

// --- RESTO DEL ARCHIVO (Todas las funciones desde aquí hasta el final permanecen intactas) ---
const getUserDetails = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) { res.status(404); throw new Error('Usuario no encontrado'); }
    const photoUrl = await getTemporaryPhotoUrl(user.photoFileId);
    const cryptoWallets = await CryptoWallet.find({ user: user._id });
    const transactions = user.transactions || [];
    res.json({ user: { ...user.toObject(), photoUrl: photoUrl || PLACEHOLDER_AVATAR_URL, balance: user.balance || { usdt: 0, ntx: 0 } }, cryptoWallets: cryptoWallets || [], transactions: { items: transactions, page: 1, totalPages: 1 } });
});

const updateUser = asyncHandler(async (req, res) => {
  const { username, password, balanceUsdt, status, role } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) { res.status(404); throw new Error('Usuario no encontrado.'); }
  const originalStatus = user.status;
  const originalRole = user.role;
  const superAdminId = process.env.SUPER_ADMIN_TELEGRAM_ID?.toString();
  const isRequesterSuper = req.user.telegramId?.toString() === superAdminId;
  if (!isRequesterSuper) { if (user.role === 'admin' || user.telegramId?.toString() === superAdminId) { res.status(403); throw new Error('No puedes modificar a este usuario.'); } if (role && role !== user.role) { res.status(403); throw new Error('No tienes permisos para promover a administrador.'); } }
  user.username = username ?? user.username;
  user.balance.usdt = balanceUsdt ?? user.balance.usdt;
  if (status && status !== originalStatus) { user.status = status; user.transactions.push({ type: 'admin_action', currency: 'SYSTEM', amount: 0, description: `Estado cambiado de '${originalStatus}' a '${status}' por el admin '${req.user.username}'.` }); }
  if (isRequesterSuper && role && role !== originalRole) { user.role = role; user.transactions.push({ type: 'admin_action', currency: 'SYSTEM', amount: 0, description: `Rol cambiado de '${originalRole}' a '${role}' por el Super Admin '${req.user.username}'.` }); }
  if (password && user.role === 'admin') { user.password = password; }
  const updatedUser = await user.save();
  res.json(updatedUser);
});

const adjustUserBalance = asyncHandler(async (req, res) => {
  const { id } = req.params; const { amount, currency } = req.body;
  const user = await User.findById(id);
  if (!user) { res.status(404); throw new Error('Usuario no encontrado'); }
  if (!['usdt', 'btc', 'eth'].includes(currency)) { res.status(400); throw new Error('Moneda inválida.'); }
  user.balance[currency] = (user.balance[currency] || 0) + amount;
  await user.save(); res.json({ message: 'Saldo ajustado correctamente.', balance: user.balance });
});

const resetAdminPassword = asyncHandler(async (req, res) => {
  const { id: adminId } = req.params;
  const adminUser = await User.findById(adminId);
  if (!adminUser) { res.status(404); throw new Error('Usuario administrador no encontrado.'); }
  if (adminUser.role !== 'admin') { res.status(400); throw new Error('Solo se puede resetear la contraseña de una cuenta de administrador.'); }
  if (adminUser._id.toString() === req.user._id.toString()) { res.status(403); throw new Error('No puedes resetear tu propia contraseña desde esta herramienta.'); }
  const superAdminId = process.env.SUPER_ADMIN_TELEGRAM_ID?.toString();
  const isTargetSuperAdmin = adminUser.telegramId?.toString() === superAdminId;
  const isRequesterSuper = req.user.telegramId?.toString() === superAdminId;
  if(isTargetSuperAdmin && !isRequesterSuper){ res.status(403); throw new Error('Solo el Super Admin puede resetear su propia contraseña.'); }
  const temporaryPassword = crypto.randomBytes(8).toString('hex');
  adminUser.password = temporaryPassword;
  adminUser.mustResetPassword = true;
  adminUser.transactions.push({ type: 'admin_action', currency: 'SYSTEM', amount: 0, description: `Contraseña de admin reseteada por '${req.user.username}'.` });
  await adminUser.save();
  res.json({ message: `Contraseña reseteada para ${adminUser.username}.`, temporaryPassword });
});

const getAllTransactions = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const search = req.query.search || '';
    const type = req.query.type || '';
    const matchStage = {};
    if (type) { matchStage.type = type; }
    if (search) { matchStage.$or = [ { 'user.username': { $regex: search, $options: 'i' } }, { 'description': { $regex: search, $options: 'i' } } ]; }
    const aggregationPipeline = [ { $sort: { createdAt: -1 } }, { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'userDetails' } }, { $unwind: { path: '$userDetails', preserveNullAndEmptyArrays: true } }, { $project: { _id: 1, amount: 1, currency: 1, type: 1, description: 1, status: 1, createdAt: 1, user: { _id: '$userDetails._id', username: '$userDetails.username' } } }, { $match: matchStage }, { $facet: { metadata: [{ $count: 'total' }], data: [{ $skip: (page - 1) * limit }, { $limit: limit }] } } ];
    const result = await Transaction.aggregate(aggregationPipeline);
    const transactions = result[0].data;
    const total = result[0].metadata.length > 0 ? result[0].metadata[0].total : 0;
    res.json({ transactions: transactions || [], page, pages: Math.ceil(total / limit), total });
});

const getPendingBlockchainTxs = asyncHandler(async (req, res) => {
  const pendingTxs = await PendingTx.find().lean(); res.json(pendingTxs);
});

const getAllFactories = asyncHandler(async (req, res) => {
  const factories = await Factory.find(); res.json(factories);
});

const createFactory = asyncHandler(async (req, res) => {
  const { isFree, ...factoryData } = req.body;
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    if (isFree) { await Factory.updateMany({ isFree: true }, { $set: { isFree: false } }, { session }); }
    const factory = new Factory({ ...factoryData, isFree });
    const createdFactory = await factory.save({ session });
    await session.commitTransaction();
    res.status(201).json(createdFactory);
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

const updateFactory = asyncHandler(async (req, res) => {
  const { isFree, ...factoryData } = req.body;
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    if (isFree) { await Factory.updateMany({ _id: { $ne: req.params.id }, isFree: true }, { $set: { isFree: false } }, { session }); }
    const factory = await Factory.findById(req.params.id);
    if (!factory) { res.status(404); throw new Error('Fábrica no encontrada'); }
    Object.assign(factory, { ...factoryData, isFree });
    const updatedFactory = await factory.save({ session });
    await session.commitTransaction();
    res.json(updatedFactory);
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

const deleteFactory = asyncHandler(async (req, res) => {
  const factory = await Factory.findById(req.params.id);
  if (!factory) { res.status(404); throw new Error('Fábrica no encontrada'); }
  await factory.deleteOne(); res.json({ message: 'Fábrica eliminada' });
});

const getSettings = asyncHandler(async (req, res) => {
  const settings = await Setting.findOne(); res.json(settings);
});

const updateSettings = asyncHandler(async (req, res) => {
  const settings = await Setting.findOne();
  if (!settings) { res.status(404); throw new Error('Configuración no encontrada'); }
  Object.assign(settings, req.body); const updatedSettings = await settings.save(); res.json(updatedSettings);
});

const generateTwoFactorSecret = asyncHandler(async (req, res) => {
  const secret = speakeasy.generateSecret({ name: 'Nexus Security App' });
  const qrCodeDataURL = await qrCodeToDataURLPromise(secret.otpauth_url);
  res.json({ secret: secret.base32, qrCodeDataURL });
});

const verifyAndEnableTwoFactor = asyncHandler(async (req, res) => {
  const { token, secret } = req.body;
  const verified = speakeasy.totp.verify({ secret, encoding: 'base32', token });
  if (!verified) { res.status(400); throw new Error('Token inválido'); }
  req.user.twoFactorEnabled = true; req.user.twoFactorSecret = secret; await req.user.save(); res.json({ message: '2FA habilitado con éxito' });
});

const sendBroadcastNotification = asyncHandler(async (req, res) => {
  const { message, imageUrl, buttonUrl, buttonText } = req.body;
  if (!message) { res.status(400); throw new Error('El mensaje es requerido.'); }
  const users = await User.find({ status: 'active' }).select('telegramId');
  const options = {};
  if (imageUrl) options.photo = imageUrl;
  if (buttonUrl && buttonText) { options.reply_markup = { inline_keyboard: [[{ text: buttonText, url: buttonUrl }]] }; }
  const results = await Promise.allSettled( users.map(u => sendTelegramMessage(u.telegramId, message, options)) );
  const successfulSends = results.filter(r => r.status === 'fulfilled').length;
  const failedSends = results.length - successfulSends;
  res.json({ message: `Notificación enviada. Éxitos: ${successfulSends}, Fallos: ${failedSends}.`, details: { successful: successfulSends, failed: failedSends } });
});

module.exports = {
  getDashboardStats,
  getPendingWithdrawals,
  processWithdrawal,
  getAllUsers,
  getUserDetails,
  updateUser,
  adjustUserBalance,
  resetAdminPassword,
  getAllTransactions,
  getPendingBlockchainTxs,
  getAllFactories,
  createFactory,
  updateFactory,
  deleteFactory,
  getSettings,
  updateSettings,
  generateTwoFactorSecret,
  verifyAndEnableTwoFactor,
  getTreasuryWalletsList,
  sweepFunds,
  sweepGas,
  analyzeGasNeeds,
  dispatchGas,
  sendBroadcastNotification
};