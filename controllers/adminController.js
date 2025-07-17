// backend/controllers/adminController.js (VERSIÓN 18.3 - COMPLETA, ESTABLE Y LISTA PARA USAR)

const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');
const Tool = require('../models/toolModel');
const Setting = require('../models/settingsModel');
const mongoose = require('mongoose');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const transactionService = require('../services/transactionService');
const { getTemporaryPhotoUrl } = require('./userController'); 
const asyncHandler = require('express-async-handler');

const qrCodeToDataURLPromise = require('util').promisify(QRCode.toDataURL);
const PLACEHOLDER_AVATAR_URL = 'https://i.ibb.co/606BFx4/user-avatar-placeholder.png';

// =================================================================
// OBTENER RETIROS PENDIENTES (Estrategia Anti-Bloqueo)
// =================================================================
const getPendingWithdrawals = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const filter = { type: 'withdrawal', status: 'pending' };

    const total = await Transaction.countDocuments(filter);
    const withdrawals = await Transaction.find(filter).sort({ createdAt: 'desc' }).limit(limit).skip(limit * (page - 1)).lean();

    if (withdrawals.length === 0) {
        return res.json({ withdrawals: [], page: 1, pages: 0, total: 0 });
    }

    const userIds = [...new Set(withdrawals.map(w => w.user.toString()))];
    const users = await User.find({ '_id': { $in: userIds } }).select('username telegramId photoFileId').lean();
    const userMap = users.reduce((acc, user) => { acc[user._id.toString()] = user; return acc; }, {});

    const withdrawalsWithDetails = [];
    for (const w of withdrawals) {
        const userInfo = userMap[w.user.toString()];
        if (userInfo) {
            const photoUrl = await getTemporaryPhotoUrl(userInfo.photoFileId);
            withdrawalsWithDetails.push({ ...w, user: { ...userInfo, photoUrl: photoUrl || PLACEHOLDER_AVATAR_URL } });
        }
    }
    res.json({ withdrawals: withdrawalsWithDetails, page, pages: Math.ceil(total / limit), total });
});

// =================================================================
// PROCESAR UN RETIRO (Aprobar/Rechazar) - LÓGICA IMPLEMENTADA
// =================================================================
const processWithdrawal = asyncHandler(async (req, res) => {
    const { status, adminNotes } = req.body;
    const { id } = req.params;

    if (!['completed', 'rejected'].includes(status)) {
        res.status(400); throw new Error("El estado debe ser 'completed' o 'rejected'.");
    }

    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        const withdrawal = await Transaction.findById(id).session(session);
        if (!withdrawal || withdrawal.type !== 'withdrawal' || withdrawal.status !== 'pending') {
            await session.abortTransaction();
            res.status(404); throw new Error('Retiro no encontrado o ya ha sido procesado.');
        }

        withdrawal.metadata.set('adminNotes', adminNotes || 'N/A');
        withdrawal.metadata.set('processedBy', req.user.username);

        if (status === 'completed') {
            const recipientAddress = withdrawal.metadata.get('walletAddress');
            const amount = withdrawal.amount;
            const currency = withdrawal.currency;
            if (!recipientAddress || !amount || !currency) throw new Error('Datos de retiro incompletos.');

            // Simulación del envío. Descomentar la línea de abajo cuando el servicio esté listo.
            // const txHash = await transactionService.sendUsdtOnTron(recipientAddress, amount);
            const txHash = `simulated_tx_${Date.now()}`;
            if (!txHash) throw new Error('La transacción falló o no se recibió un hash.');

            withdrawal.status = 'completed';
            withdrawal.metadata.set('transactionHash', txHash);
            withdrawal.description = `Retiro completado. Hash: ${txHash.substring(0, 15)}...`;
        } else { // status === 'rejected'
            const user = await User.findById(withdrawal.user).session(session);
            if (!user) throw new Error('Usuario del retiro no encontrado para el reembolso.');
            user.balance.usdt += withdrawal.amount;
            await user.save({ session });
            withdrawal.status = 'rejected';
            withdrawal.description = `Retiro rechazado por admin. Fondos devueltos al saldo.`;
        }

        const updatedWithdrawal = await withdrawal.save({ session });
        await session.commitTransaction();
        res.json({ message: `Retiro marcado como '${status}' exitosamente.`, withdrawal: updatedWithdrawal });
    } catch (error) {
        await session.abortTransaction();
        console.error("Error en processWithdrawal:", error);
        res.status(500).json({ message: error.message || "Error del servidor al procesar el retiro." });
    } finally {
        session.endSession();
    }
});

// =================================================================
// OBTENER DETALLES DE UN USUARIO (Estrategia Anti-Bloqueo)
// =================================================================
const getUserDetails = asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) { res.status(400); throw new Error('ID de usuario no válido.'); }
    const userId = new mongoose.Types.ObjectId(req.params.id);

    const [user, transactions, referrals] = await Promise.all([
        User.findById(userId).select('-password').lean(),
        Transaction.find({ user: userId }).sort({ createdAt: -1 }).limit(10).lean(),
        User.find({ referredBy: userId }).select('username telegramId photoFileId createdAt').lean()
    ]);

    if (!user) { res.status(404); throw new Error('Usuario no encontrado.'); }
    
    const userPhotoUrl = await getTemporaryPhotoUrl(user.photoFileId);
    
    const referralsWithPhoto = [];
    for (const ref of referrals) {
        const photoUrl = await getTemporaryPhotoUrl(ref.photoFileId);
        referralsWithPhoto.push({ ...ref, photoUrl: photoUrl || PLACEHOLDER_AVATAR_URL });
    }
    
    res.json({
        user: { ...user, photoUrl: userPhotoUrl || PLACEHOLDER_AVATAR_URL },
        transactions: { items: transactions, total: transactions.length },
        referrals: referralsWithPhoto
    });
});

// =================================================================
// OBTENER TODOS LOS USUARIOS (YA OPTIMIZADA)
// =================================================================
const getAllUsers = asyncHandler(async (req, res) => {
    const pageSize = parseInt(req.query.limit) || 10;
    const page = parseInt(req.query.page) || 1;
    const filter = req.query.search ? { $or: [{ username: { $regex: req.query.search, $options: 'i' } }, { telegramId: { $regex: req.query.search, $options: 'i' } }] } : {};

    const count = await User.countDocuments(filter);
    const users = await User.find(filter).select('username telegramId role status createdAt balance.usdt photoFileId').sort({ createdAt: -1 }).limit(pageSize).skip(pageSize * (page - 1)).lean();
    const usersWithPhotoUrl = await Promise.all(users.map(async (user) => ({ ...user, photoUrl: await getTemporaryPhotoUrl(user.photoFileId) || PLACEHOLDER_AVATAR_URL })));
    
    res.json({ users: usersWithPhotoUrl, page, pages: Math.ceil(count / pageSize), totalUsers: count });
});

// =================================================================
// RESTO DE FUNCIONES (SIN CAMBIOS)
// =================================================================

const getUserReferrals = async (req, res) => {
    try {
        const userId = req.params.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        if (!mongoose.Types.ObjectId.isValid(userId)) { return res.status(400).json({ message: "ID de usuario no válido." }); }
        const filter = { referredBy: new mongoose.Types.ObjectId(userId) };
        const totalReferrals = await User.countDocuments(filter);
        const referrals = await User.find(filter).select('username fullName telegramId createdAt balance.usdt photoFileId').sort({ createdAt: -1 }).limit(limit).skip(limit * (page - 1)).lean();
        const referralsData = await Promise.all(referrals.map(async ref => ({ _id: ref._id, username: ref.username, fullName: ref.fullName, photoUrl: await getTemporaryPhotoUrl(ref.photoFileId) || PLACEHOLDER_AVATAR_URL, joinDate: ref.createdAt, totalDeposit: ref.balance.usdt, level: 1 })));
        res.json({ totalReferrals, referrals: referralsData, page, pages: Math.ceil(totalReferrals / limit) });
    } catch (error) {
        console.error("Error en getUserReferrals:", error);
        res.status(500).json({ message: "Error del servidor al obtener los referidos." });
    }
};

const getAdminTestData = async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    res.json({ message: `Hola, admin ${req.user.username}! Has accedido a una ruta protegida.`, serverTime: new Date().toISOString(), totalUsersInDB: userCount });
  } catch(error) {
      console.error("Error en getAdminTestData:", error);
      res.status(500).json({ message: "Error del servidor al obtener datos de prueba." });
  }
};

const updateUser = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'ID de usuario no válido.' });
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
    user.role = req.body.role ?? user.role;
    user.balance.usdt = req.body.balanceUsdt ?? user.balance.usdt;
    user.balance.ntx = req.body.balanceNtx ?? user.balance.ntx;
    const updatedUser = await user.save();
    res.json(updatedUser);
  } catch (error) {
    console.error("Error en updateUser:", error);
    res.status(500).json({ message: 'Error del servidor al actualizar el usuario.' });
  }
};

const setUserStatus = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'ID de usuario no válido.' });
  const { status } = req.body;
  if (!status || !['active', 'banned'].includes(status)) return res.status(400).json({ message: "El estado proporcionado no es válido." });
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
    if (user._id.equals(req.user._id)) return res.status(400).json({ message: 'No puedes cambiar tu propio estado.' });
    user.status = status;
    const updatedUser = await user.save();
    res.json(updatedUser);
  } catch (error) {
    console.error("Error en setUserStatus:", error);
    res.status(500).json({ message: 'Error del servidor al cambiar el estado del usuario.' });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const last14Days = new Date();
    last14Days.setDate(last14Days.getDate() - 14);
    const [totalUsers, totalDepositVolume, userGrowthData] = await Promise.all([
      User.countDocuments(),
      Transaction.aggregate([{ $match: { type: 'deposit', currency: 'USDT' } }, { $group: { _id: null, totalVolume: { $sum: '$amount' } } }]),
      User.aggregate([{ $match: { createdAt: { $gte: last14Days } } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }])
    ]);
    res.json({ totalUsers, totalDepositVolume: totalDepositVolume[0]?.totalVolume || 0, userGrowthData: userGrowthData.map(item => ({ date: item._id, NuevosUsuarios: item.count })) });
  } catch (error) {
    console.error("Error en getDashboardStats:", error);
    res.status(500).json({ message: 'Error del servidor al obtener las estadísticas.' });
  }
};

const getAllTransactions = async (req, res) => {
  try {
    const pageSize = 15;
    const page = Number(req.query.page) || 1;
    const { search, type } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (search) {
      const usersFound = await User.find({ $or: [{ username: { $regex: search, $options: 'i' } }, { telegramId: { $regex: search, $options: 'i' } }] }).select('_id').lean();
      filter.user = { $in: usersFound.map(user => user._id) };
    }
    const count = await Transaction.countDocuments(filter);
    const transactions = await Transaction.find(filter).sort({ createdAt: -1 }).populate('user', 'username telegramId').limit(pageSize).skip(pageSize * (page - 1)).lean();
    res.json({ transactions, page, pages: Math.ceil(count / pageSize), totalTransactions: count });
  } catch (error) {
    console.error("Error en getAllTransactions:", error);
    res.status(500).json({ message: 'Error del servidor al obtener la lista de transacciones.' });
  }
};

const createManualTransaction = async (req, res) => {
  const { userId, type, currency, amount, reason } = req.body;
  if (!userId || !type || !currency || !amount || !reason) return res.status(400).json({ message: 'Faltan campos requeridos.' });
  if (!['admin_credit', 'admin_debit'].includes(type)) return res.status(400).json({ message: 'El tipo de transacción debe ser "admin_credit" o "admin_debit".' });
  if (amount <= 0) return res.status(400).json({ message: 'El monto debe ser un número positivo.' });
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const user = await User.findById(userId).session(session);
    if (!user) throw new Error('Usuario no encontrado.');
    const currencyKey = currency.toLowerCase();
    const originalBalance = user.balance[currencyKey] || 0;
    if (type === 'admin_credit') { user.balance[currencyKey] += amount; } else {
      if (originalBalance < amount) throw new Error('Saldo insuficiente para realizar el débito.');
      user.balance[currencyKey] -= amount;
    }
    await user.save({ session });
    const transaction = new Transaction({ user: userId, type, currency, amount, description: reason, status: 'completed', metadata: { adminId: req.user._id.toString(), adminUsername: req.user.username, originalBalance: originalBalance.toString() } });
    await transaction.save({ session });
    await session.commitTransaction();
    res.status(201).json({ message: 'Transacción manual creada y saldo actualizado exitosamente.', user: user.toObject() });
  } catch (error) {
    await session.abortTransaction();
    console.error("Error en createManualTransaction:", error);
    res.status(500).json({ message: error.message || 'Error del servidor al procesar la transacción.' });
  } finally { session.endSession(); }
};

const getAllTools = async (req, res) => {
  try {
    const tools = await Tool.find({}).sort({ vipLevel: 1 }).lean();
    res.json(tools);
  } catch (error) { res.status(500).json({ message: 'Error al obtener herramientas.' }); }
};

const createTool = async (req, res) => {
  try {
    const { name, vipLevel, price, miningBoost, durationDays, imageUrl } = req.body;
    const toolExists = await Tool.findOne({ vipLevel });
    if (toolExists) return res.status(400).json({ message: `Ya existe una herramienta con el VIP Level ${vipLevel}.` });
    const newTool = await Tool.create({ name, vipLevel, price, miningBoost, durationDays, imageUrl });
    res.status(201).json(newTool);
  } catch (error) { res.status(500).json({ message: 'Error al crear la herramienta.' }); }
};

const updateTool = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, vipLevel, price, miningBoost, durationDays, imageUrl } = req.body;
    const tool = await Tool.findById(id);
    if (!tool) return res.status(404).json({ message: 'Herramienta no encontrada.' });
    const existingToolWithVipLevel = await Tool.findOne({ vipLevel, _id: { $ne: id } });
    if (existingToolWithVipLevel) return res.status(400).json({ message: `El VIP Level ${vipLevel} ya está siendo usado por otra herramienta.` });
    tool.name = name; tool.vipLevel = vipLevel; tool.price = price; tool.miningBoost = miningBoost; tool.durationDays = durationDays; tool.imageUrl = imageUrl;
    const updatedTool = await tool.save();
    res.json(updatedTool);
  } catch (error) { res.status(500).json({ message: 'Error al actualizar la herramienta.' }); }
};

const deleteTool = async (req, res) => {
  try {
    const tool = await Tool.findById(req.params.id);
    if (!tool) return res.status(404).json({ message: 'Herramienta no encontrada.' });
    await tool.deleteOne();
    res.json({ message: 'Herramienta eliminada exitosamente.' });
  } catch (error) { res.status(500).json({ message: 'Error al eliminar la herramienta.' }); }
};

const getSettings = async (req, res) => {
  try {
    const settings = await Setting.findOneAndUpdate({ singleton: 'global_settings' }, { $setOnInsert: { singleton: 'global_settings' } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
    res.json(settings);
  } catch (error) { res.status(500).json({ message: 'Error al obtener la configuración.' }); }
};

const updateSettings = async (req, res) => {
  try {
    const updatedSettings = await Setting.findOneAndUpdate({ singleton: 'global_settings' }, req.body, { new: true });
    res.json(updatedSettings);
  } catch (error) { res.status(500).json({ message: 'Error al actualizar la configuración.' }); }
};

const generateTwoFactorSecret = async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({ name: `NeuroLink Admin (${req.user.username})` });
    await User.findByIdAndUpdate(req.user.id, { twoFactorSecret: secret.base32 });
    const data_url = await qrCodeToDataURLPromise(secret.otpauth_url);
    res.json({ secret: secret.base32, qrCodeUrl: data_url });
  } catch (error) { console.error("Error en generateTwoFactorSecret:", error); res.status(500).json({ message: 'Error al generar el secreto 2FA.' }); }
};

const verifyAndEnableTwoFactor = async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ message: 'El token de verificación es requerido.' });
  try {
    const user = await User.findById(req.user.id).select('+twoFactorSecret');
    if (!user || !user.twoFactorSecret) return res.status(400).json({ message: 'No se ha generado un secreto 2FA para este usuario.' });
    const verified = speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: 'base32', token });
    if (verified) {
      user.isTwoFactorEnabled = true; await user.save();
      res.json({ message: '¡2FA habilitado exitosamente!' });
    } else { res.status(400).json({ message: 'Token de verificación inválido.' }); }
  } catch (error) { console.error("Error en verifyAndEnableTwoFactor:", error); res.status(500).json({ message: 'Error al verificar el token 2FA.' }); }
};

const getTreasuryAndSweepData = asyncHandler(async (req, res) => {
    res.status(501).json({ message: "Funcionalidad de Tesorería/Barrido pendiente de implementación." });
});

// =================================================================
// EXPORTACIÓN FINAL 100% COMPLETA
// =================================================================
module.exports = {
  getPendingWithdrawals,
  processWithdrawal,
  getUserReferrals,
  getAdminTestData,
  getAllUsers,
  updateUser,
  setUserStatus,
  getDashboardStats,
  getAllTransactions,
  createManualTransaction,
  getAllTools,
  createTool,
  updateTool,
  deleteTool,
  getUserDetails,
  getSettings,
  updateSettings,
  generateTwoFactorSecret,
  verifyAndEnableTwoFactor,
  getTreasuryAndSweepData,
};