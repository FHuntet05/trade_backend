// backend/controllers/adminController.js (VERSIÓN 20.0 - FORENSE ANTI-COLAPSO)

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

// =========================================================================================
// OBTENER RETIROS PENDIENTES (REESCRITO PARA SER 100% SECUENCIAL Y CON LOGS DETALLADOS)
// =========================================================================================
const getPendingWithdrawals = asyncHandler(async (req, res) => {
    console.log('[LOG FORENSE] 1. Iniciando getPendingWithdrawals...');
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const filter = { type: 'withdrawal', status: 'pending' };

    console.log('[LOG FORENSE] 2. Contando documentos de retiro...');
    const total = await Transaction.countDocuments(filter);
    console.log(`[LOG FORENSE] 3. Total de retiros encontrados: ${total}`);

    console.log('[LOG FORENSE] 4. Buscando documentos de retiro...');
    const withdrawals = await Transaction.find(filter).sort({ createdAt: 'desc' }).limit(limit).skip(limit * (page - 1)).lean();
    console.log(`[LOG FORENSE] 5. Documentos de retiro obtenidos: ${withdrawals.length}`);

    if (withdrawals.length === 0) {
        console.log('[LOG FORENSE] 5.1. No hay retiros, devolviendo respuesta vacía.');
        return res.json({ withdrawals: [], page: 1, pages: 0, total: 0 });
    }

    const userIds = [...new Set(withdrawals.map(w => w.user.toString()))];
    console.log(`[LOG FORENSE] 6. IDs de usuario extraídos: ${userIds.length}`);

    console.log('[LOG FORENSE] 7. Buscando información de usuarios...');
    const users = await User.find({ '_id': { $in: userIds } }).select('username telegramId photoFileId').lean();
    console.log(`[LOG FORENSE] 8. Información de usuarios obtenida: ${users.length}`);

    const userMap = users.reduce((acc, user) => { acc[user._id.toString()] = user; return acc; }, {});

    console.log('[LOG FORENSE] 9. Iniciando enriquecimiento de datos (uno por uno)...');
    const withdrawalsWithDetails = [];
    for (const w of withdrawals) {
        const userInfo = userMap[w.user.toString()];
        if (userInfo) {
            console.log(`[LOG FORENSE]   - Procesando retiro para usuario: ${userInfo.username}`);
            const photoUrl = await getTemporaryPhotoUrl(userInfo.photoFileId);
            withdrawalsWithDetails.push({ ...w, user: { ...userInfo, photoUrl: photoUrl || PLACEHOLDER_AVATAR_URL } });
        }
    }

    console.log('[LOG FORENSE] 10. Enriquecimiento completo. Enviando respuesta final.');
    res.json({ withdrawals: withdrawalsWithDetails, page, pages: Math.ceil(total / limit), total });
});

// =======================================================================================
// OBTENER DETALLES DE USUARIO (REESCRITO PARA SER 100% SECUENCIAL Y CON LOGS DETALLADOS)
// =======================================================================================
const getUserDetails = asyncHandler(async (req, res) => {
    console.log('[LOG FORENSE] 1. Iniciando getUserDetails...');
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) { res.status(400); throw new Error('ID de usuario no válido.'); }
    const userId = new mongoose.Types.ObjectId(req.params.id);

    console.log('[LOG FORENSE] 2. Obteniendo datos principales del usuario...');
    const user = await User.findById(userId).select('-password').lean();
    if (!user) { res.status(404); throw new Error('Usuario no encontrado.'); }
    console.log(`[LOG FORENSE] 3. Usuario ${user.username} encontrado.`);

    console.log('[LOG FORENSE] 4. Obteniendo transacciones del usuario...');
    const transactions = await Transaction.find({ user: userId }).sort({ createdAt: -1 }).limit(10).lean();
    console.log(`[LOG FORENSE] 5. Transacciones encontradas: ${transactions.length}`);

    console.log('[LOG FORENSE] 6. Obteniendo referidos del usuario...');
    const referrals = await User.find({ referredBy: userId }).select('username telegramId photoFileId createdAt').lean();
    console.log(`[LOG FORENSE] 7. Referidos encontrados: ${referrals.length}`);

    console.log('[LOG FORENSE] 8. Obteniendo foto del usuario principal...');
    const userPhotoUrl = await getTemporaryPhotoUrl(user.photoFileId);

    console.log('[LOG FORENSE] 9. Enriqueciendo referidos (uno por uno)...');
    const referralsWithPhoto = [];
    for (const ref of referrals) {
        const photoUrl = await getTemporaryPhotoUrl(ref.photoFileId);
        referralsWithPhoto.push({ ...ref, photoUrl: photoUrl || PLACEHOLDER_AVATAR_URL });
    }

    console.log('[LOG FORENSE] 10. Enriquecimiento completo. Enviando respuesta final.');
    res.json({
        user: { ...user, photoUrl: userPhotoUrl || PLACEHOLDER_AVATAR_URL },
        transactions: { items: transactions, total: transactions.length },
        referrals: referralsWithPhoto
    });
});

// =================================================================
// CÓDIGO RESTANTE (SIN CAMBIOS, PERO INCLUIDO PARA QUE ESTÉ COMPLETO)
// =================================================================
const processWithdrawal = asyncHandler(async (req, res) => {
    const { status, adminNotes } = req.body; const { id } = req.params;
    if (!['completed', 'rejected'].includes(status)) { res.status(400); throw new Error("El estado debe ser 'completed' o 'rejected'."); }
    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        const withdrawal = await Transaction.findById(id).session(session);
        if (!withdrawal || withdrawal.type !== 'withdrawal' || withdrawal.status !== 'pending') { await session.abortTransaction(); res.status(404); throw new Error('Retiro no encontrado o ya ha sido procesado.'); }
        withdrawal.metadata.set('adminNotes', adminNotes || 'N/A'); withdrawal.metadata.set('processedBy', req.user.username);
        if (status === 'completed') {
            const recipientAddress = withdrawal.metadata.get('walletAddress'); const amount = withdrawal.amount; const currency = withdrawal.currency;
            if (!recipientAddress || !amount || !currency) throw new Error('Datos de retiro incompletos.');
            const txHash = `simulated_tx_${Date.now()}`;
            if (!txHash) throw new Error('La transacción falló o no se recibió un hash.');
            withdrawal.status = 'completed'; withdrawal.metadata.set('transactionHash', txHash); withdrawal.description = `Retiro completado. Hash: ${txHash.substring(0, 15)}...`;
        } else {
            const user = await User.findById(withdrawal.user).session(session);
            if (!user) throw new Error('Usuario del retiro no encontrado para el reembolso.');
            user.balance.usdt += withdrawal.amount; await user.save({ session });
            withdrawal.status = 'rejected'; withdrawal.description = `Retiro rechazado por admin. Fondos devueltos al saldo.`;
        }
        const updatedWithdrawal = await withdrawal.save({ session });
        await session.commitTransaction();
        res.json({ message: `Retiro marcado como '${status}' exitosamente.`, withdrawal: updatedWithdrawal });
    } catch (error) {
        await session.abortTransaction(); console.error("Error en processWithdrawal:", error);
        res.status(500).json({ message: error.message || "Error del servidor al procesar el retiro." });
    } finally { session.endSession(); }
});

const getAllUsers = asyncHandler(async (req, res) => {
    const pageSize = 10; const page = Number(req.query.page) || 1;
    const filter = req.query.search ? { $or: [{ username: { $regex: req.query.search, $options: 'i' } }, { telegramId: { $regex: req.query.search, $options: 'i' } }] } : {};
    const count = await User.countDocuments(filter);
    const users = await User.find(filter).select('username telegramId role status createdAt balance.usdt photoFileId').sort({ createdAt: -1 }).limit(pageSize).skip(pageSize * (page - 1)).lean();
    const usersWithPhotoUrl = [];
    for(const user of users) { usersWithPhotoUrl.push({ ...user, photoUrl: await getTemporaryPhotoUrl(user.photoFileId) || PLACEHOLDER_AVATAR_URL }); }
    res.json({ users: usersWithPhotoUrl, page, pages: Math.ceil(count / pageSize), totalUsers: count });
});

const getUserReferrals = async (req, res) => {
    try {
        const userId = req.params.id; const page = parseInt(req.query.page) || 1; const limit = parseInt(req.query.limit) || 10;
        if (!mongoose.Types.ObjectId.isValid(userId)) { return res.status(400).json({ message: "ID de usuario no válido." }); }
        const filter = { referredBy: new mongoose.Types.ObjectId(userId) };
        const totalReferrals = await User.countDocuments(filter);
        const referrals = await User.find(filter).select('username fullName telegramId createdAt balance.usdt photoFileId').sort({ createdAt: -1 }).limit(limit).skip(limit * (page - 1)).lean();
        const referralsData = [];
        for(const ref of referrals) { referralsData.push({ _id: ref._id, username: ref.username, fullName: ref.fullName, photoUrl: await getTemporaryPhotoUrl(ref.photoFileId) || PLACEHOLDER_AVATAR_URL, joinDate: ref.createdAt, totalDeposit: ref.balance.usdt, level: 1 }); }
        res.json({ totalReferrals, referrals: referralsData, page, pages: Math.ceil(totalReferrals / limit) });
    } catch (error) { console.error("Error en getUserReferrals:", error); res.status(500).json({ message: "Error del servidor al obtener los referidos." }); }
};

const getAdminTestData = async (req, res) => { res.json({ message: `Hola, admin ${req.user.username}!` }); };
const updateUser = async (req, res) => { const user = await User.findById(req.params.id); if (!user) { return res.status(404).json({ message: 'Usuario no encontrado.' }); } user.role = req.body.role ?? user.role; user.balance.usdt = req.body.balanceUsdt ?? user.balance.usdt; user.balance.ntx = req.body.balanceNtx ?? user.balance.ntx; const updatedUser = await user.save(); res.json(updatedUser); };
const setUserStatus = async (req, res) => { const user = await User.findById(req.params.id); if (!user) { return res.status(404).json({ message: 'Usuario no encontrado.' }); } if (user._id.equals(req.user._id)) { return res.status(400).json({ message: 'No puedes cambiar tu propio estado.' }); } user.status = req.body.status; const updatedUser = await user.save(); res.json(updatedUser); };
const getDashboardStats = async (req, res) => { const [totalUsers, totalDepositVolume] = await Promise.all([ User.countDocuments(), Transaction.aggregate([{ $match: { type: 'deposit', currency: 'USDT' } }, { $group: { _id: null, totalVolume: { $sum: '$amount' } } }]) ]); res.json({ totalUsers, totalDepositVolume: totalDepositVolume[0]?.totalVolume || 0 }); };
const getAllTransactions = async (req, res) => { const pageSize = 15; const page = Number(req.query.page) || 1; const filter = {}; if (req.query.type) filter.type = req.query.type; if (req.query.search) { const usersFound = await User.find({ $or: [{ username: { $regex: req.query.search, $options: 'i' } }, { telegramId: { $regex: req.query.search, $options: 'i' } }] }).select('_id'); filter.user = { $in: usersFound.map(user => user._id) }; } const count = await Transaction.countDocuments(filter); const transactions = await Transaction.find(filter).sort({ createdAt: -1 }).populate('user', 'username telegramId').limit(pageSize).skip(pageSize * (page - 1)).lean(); res.json({ transactions, page, pages: Math.ceil(count / pageSize), totalTransactions: count }); };
const createManualTransaction = async (req, res) => { const { userId, type, currency, amount, reason } = req.body; const session = await mongoose.startSession(); try { session.startTransaction(); const user = await User.findById(userId).session(session); if (!user) throw new Error('Usuario no encontrado.'); const currencyKey = currency.toLowerCase(); const originalBalance = user.balance[currencyKey] || 0; if (type === 'admin_credit') { user.balance[currencyKey] += amount; } else { if (originalBalance < amount) throw new Error('Saldo insuficiente para realizar el débito.'); user.balance[currencyKey] -= amount; } await user.save({ session }); const transaction = new Transaction({ user: userId, type, currency, amount, description: reason, status: 'completed', metadata: { adminId: req.user._id.toString(), adminUsername: req.user.username, originalBalance: originalBalance.toString() } }); await transaction.save({ session }); await session.commitTransaction(); res.status(201).json({ message: 'Transacción manual creada.', user: user.toObject() }); } catch (error) { await session.abortTransaction(); res.status(500).json({ message: error.message }); } finally { session.endSession(); } };
const getAllTools = async (req, res) => { const tools = await Tool.find({}).sort({ vipLevel: 1 }).lean(); res.json(tools); };
const createTool = async (req, res) => { const newTool = await Tool.create(req.body); res.status(201).json(newTool); };
const updateTool = async (req, res) => { const tool = await Tool.findByIdAndUpdate(req.params.id, req.body, { new: true }); if (!tool) return res.status(404).json({ message: 'Herramienta no encontrada.' }); res.json(tool); };
const deleteTool = async (req, res) => { const tool = await Tool.findById(req.params.id); if (!tool) return res.status(404).json({ message: 'Herramienta no encontrada.' }); await tool.deleteOne(); res.json({ message: 'Herramienta eliminada.' }); };
const getSettings = async (req, res) => { const settings = await Setting.findOneAndUpdate({ singleton: 'global_settings' }, { $setOnInsert: { singleton: 'global_settings' } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean(); res.json(settings); };
const updateSettings = async (req, res) => { const updatedSettings = await Setting.findOneAndUpdate({ singleton: 'global_settings' }, req.body, { new: true }); res.json(updatedSettings); };
const generateTwoFactorSecret = async (req, res) => { const secret = speakeasy.generateSecret({ name: `NeuroLink Admin (${req.user.username})` }); await User.findByIdAndUpdate(req.user.id, { twoFactorSecret: secret.base32 }); const data_url = await qrCodeToDataURLPromise(secret.otpauth_url); res.json({ secret: secret.base32, qrCodeUrl: data_url }); };
const verifyAndEnableTwoFactor = async (req, res) => { const { token } = req.body; const user = await User.findById(req.user.id).select('+twoFactorSecret'); if (!user || !user.twoFactorSecret) return res.status(400).json({ message: 'No se ha generado un secreto 2FA.' }); const verified = speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: 'base32', token }); if (verified) { user.isTwoFactorEnabled = true; await user.save(); res.json({ message: '¡2FA habilitado!' }); } else { res.status(400).json({ message: 'Token inválido.' }); } };
const getTreasuryAndSweepData = asyncHandler(async (req, res) => { res.status(501).json({ message: "Funcionalidad no implementada." }); });

module.exports = {
  getPendingWithdrawals, processWithdrawal, getUserReferrals, getAdminTestData, getAllUsers,
  updateUser, setUserStatus, getDashboardStats, getAllTransactions, createManualTransaction,
  getAllTools, createTool, updateTool, deleteTool, getUserDetails, getSettings,
  updateSettings, generateTwoFactorSecret, verifyAndEnableTwoFactor, getTreasuryAndSweepData,
};