// backend/controllers/adminController.js (VERSIÓN v17.2 - OPTIMIZADO Y ESTABILIZADO)

const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');
const Tool = require('../models/toolModel');
const Setting = require('../models/settingsModel');
const mongoose = require('mongoose');
const speakeasy = 'speakeasy'; // Dummy, ya que no se usa en este scope
const QRCode = require('qrcode');
const { getTemporaryPhotoUrl } = require('./userController'); 
const asyncHandler = require('express-async-handler');
const { sendTelegramMessage } = require('../services/notificationService');

const qrCodeToDataURLPromise = require('util').promisify(QRCode.toDataURL);
const PLACEHOLDER_AVATAR_URL = 'https://i.ibb.co/606BFx4/user-avatar-placeholder.png';

// --- FUNCIONES EXISTENTES (SIN CAMBIOS SIGNIFICATIVOS, PERO MANTENIDAS) ---
const getPendingWithdrawals = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const filter = { type: 'withdrawal', status: 'pending' };
    const total = await Transaction.countDocuments(filter);
    const withdrawals = await Transaction.find(filter).sort({ createdAt: 'desc' }).limit(limit).skip(limit * (page - 1)).lean();
    if (withdrawals.length === 0) return res.json({ withdrawals: [], page: 1, pages: 0, total: 0 });
    const userIds = [...new Set(withdrawals.map(w => w.user.toString()))];
    const users = await User.find({ '_id': { $in: userIds } }).select('username telegramId photoFileId').lean();
    const userMap = users.reduce((acc, user) => { acc[user._id.toString()] = user; return acc; }, {});
    const withdrawalsWithDetails = await Promise.all(withdrawals.map(async (w) => {
        const userInfo = userMap[w.user.toString()];
        if (userInfo) {
            const photoUrl = await getTemporaryPhotoUrl(userInfo.photoFileId);
            return { ...w, user: { ...userInfo, photoUrl: photoUrl || PLACEHOLDER_AVATAR_URL } };
        }
        return w; // Devuelve el retiro aunque el usuario no se encuentre
    }));
    res.json({ withdrawals: withdrawalsWithDetails.filter(Boolean), page, pages: Math.ceil(total / limit), total });
});

const processWithdrawal = asyncHandler(async (req, res) => {
    const { status, adminNotes } = req.body;
    const { id } = req.params;
    if (!['completed', 'rejected'].includes(status)) { res.status(400); throw new Error("El estado debe ser 'completed' o 'rejected'."); }
    const withdrawal = await Transaction.findById(id).populate('user', 'telegramId');
    if (!withdrawal || withdrawal.type !== 'withdrawal' || withdrawal.status !== 'pending') { res.status(404); throw new Error('Retiro no encontrado o ya ha sido procesado.'); }
    const userToNotify = withdrawal.user;
    if (!userToNotify || !userToNotify.telegramId) { console.warn(`No se pudo encontrar el telegramId para el usuario ${withdrawal.user._id}. No se enviará notificación.`); }
    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        withdrawal.metadata.set('adminNotes', adminNotes || 'N/A');
        withdrawal.metadata.set('processedBy', req.user.username);
        let notificationMessage = '';
        if (status === 'completed') {
            const recipientAddress = withdrawal.metadata.get('walletAddress');
            const amount = withdrawal.amount;
            const currency = withdrawal.currency;
            if (!recipientAddress || !amount || !currency) throw new Error('Datos de retiro incompletos.');
            const txHash = `simulated_tx_${Date.now()}`; 
            withdrawal.status = 'completed';
            withdrawal.metadata.set('transactionHash', txHash);
            withdrawal.description = `Retiro completado. Hash: ${txHash.substring(0, 15)}...`;
            notificationMessage = `✅ <b>¡Retiro Aprobado!</b>\n\n` + `Tu solicitud de retiro por <b>${amount.toFixed(2)} ${currency}</b> ha sido procesada y los fondos han sido enviados.\n\n` + `<b>Dirección:</b> <code>${recipientAddress}</code>\n` + `<b>Hash de transacción:</b> <code>${txHash}</code>`;
        } else {
            const userForRefund = await User.findById(withdrawal.user._id).session(session);
            if (!userForRefund) throw new Error('Usuario del retiro no encontrado para el reembolso.');
            userForRefund.balance.usdt += withdrawal.amount;
            await userForRefund.save({ session });
            withdrawal.status = 'rejected';
            withdrawal.description = `Retiro rechazado por admin. Fondos devueltos al saldo.`;
            notificationMessage = `❌ <b>Retiro Rechazado</b>\n\n` + `Tu solicitud de retiro por <b>${withdrawal.amount.toFixed(2)} USDT</b> ha sido rechazada.\n\n` + `<b>Motivo:</b> ${adminNotes || 'Contacta a soporte para más detalles.'}\n\n` + `Los fondos han sido devueltos a tu saldo.`;
        }
        const updatedWithdrawal = await withdrawal.save({ session });
        await session.commitTransaction();
        if (userToNotify && userToNotify.telegramId && notificationMessage) {
            await sendTelegramMessage(userToNotify.telegramId, notificationMessage);
        }
        res.json({ message: `Retiro marcado como '${status}' exitosamente.`, withdrawal: updatedWithdrawal });
    } catch (error) {
        await session.abortTransaction();
        console.error("Error en processWithdrawal:", error);
        res.status(500).json({ message: error.message || "Error del servidor al procesar el retiro." });
    } finally {
        session.endSession();
    }
});


// =======================================================================================
// ========= INICIO DE LA FUNCIÓN getUserDetails (REESCRITA Y OPTIMIZADA) ================
// =======================================================================================
const getUserDetails = asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        res.status(400);
        throw new Error('ID de usuario no válido.');
    }
    const userId = new mongoose.Types.ObjectId(req.params.id);

    // 1. Ejecutamos las consultas principales en paralelo para máxima eficiencia.
    const [user, transactions, referrals] = await Promise.all([
        User.findById(userId).select('-password').lean(),
        Transaction.find({ user: userId }).sort({ createdAt: -1 }).limit(10).lean(),
        User.find({ referredBy: userId }).select('username fullName telegramId photoFileId createdAt').lean()
    ]);

    if (!user) {
        res.status(404);
        throw new Error('Usuario no encontrado.');
    }

    // 2. Enriquecemos los datos con las fotos también en paralelo.
    const [userPhotoUrl, referralsWithPhoto] = await Promise.all([
        getTemporaryPhotoUrl(user.photoFileId),
        Promise.all(referrals.map(async (ref) => {
            const photoUrl = await getTemporaryPhotoUrl(ref.photoFileId);
            return { ...ref, photoUrl: photoUrl || PLACEHOLDER_AVATAR_URL };
        }))
    ]);

    // 3. Ensamblamos la respuesta final.
    res.json({
        user: { ...user, photoUrl: userPhotoUrl || PLACEHOLDER_AVATAR_URL },
        transactions, // La consulta ya era correcta, no necesita { items, total }
        referrals: referralsWithPhoto
    });
});
// =======================================================================================
// ============ FIN DE LA FUNCIÓN getUserDetails (REESCRITA Y OPTIMIZADA) ================
// =======================================================================================


// --- CÓDIGO RESTANTE (Optimizaciones menores y limpieza) ---
const getAllUsers = asyncHandler(async (req, res) => {
    const pageSize = 10; const page = Number(req.query.page) || 1;
    const filter = req.query.search ? { $or: [{ username: { $regex: req.query.search, $options: 'i' } }, { telegramId: { $regex: req.query.search, $options: 'i' } }] } : {};
    const count = await User.countDocuments(filter);
    const users = await User.find(filter).select('username telegramId role status createdAt balance.usdt photoFileId').sort({ createdAt: -1 }).limit(pageSize).skip(pageSize * (page - 1)).lean();
    
    // Optimizacion: Usar Promise.all para obtener fotos en paralelo
    const usersWithPhotoUrl = await Promise.all(users.map(async (user) => ({
        ...user,
        photoUrl: await getTemporaryPhotoUrl(user.photoFileId) || PLACEHOLDER_AVATAR_URL
    })));

    res.json({ users: usersWithPhotoUrl, page, pages: Math.ceil(count / pageSize), totalUsers: count });
});

const updateUser = asyncHandler(async (req, res) => {
    const { role, balanceUsdt, balanceNtx } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) { res.status(404); throw new Error('Usuario no encontrado.'); }
    user.role = role ?? user.role;
    user.balance.usdt = balanceUsdt ?? user.balance.usdt;
    user.balance.ntx = balanceNtx ?? user.balance.ntx;
    const updatedUser = await user.save();
    res.json(updatedUser);
});

const setUserStatus = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) { res.status(404); throw new Error('Usuario no encontrado.'); }
    if (user._id.equals(req.user._id)) { res.status(400); throw new Error('No puedes cambiar tu propio estado.'); }
    user.status = req.body.status;
    const updatedUser = await user.save();
    res.json(updatedUser);
});

const getAllTransactions = asyncHandler(async (req, res) => {
    const pageSize = 15;
    const page = Number(req.query.page) || 1;
    let filter = {};
    if (req.query.type) {
        filter.type = req.query.type;
    }
    if (req.query.search) {
        // Busca usuarios y luego usa sus IDs en el filtro de transacciones
        const usersFound = await User.find({
            $or: [
                { username: { $regex: req.query.search, $options: 'i' } },
                { telegramId: { $regex: req.query.search, $options: 'i' } }
            ]
        }).select('_id');
        filter.user = { $in: usersFound.map(user => user._id) };
    }

    const count = await Transaction.countDocuments(filter);
    // Optimización: Usar populate en lugar de buscar usuarios por separado después
    const transactions = await Transaction.find(filter)
        .sort({ createdAt: -1 })
        .populate('user', 'username telegramId') // <-- Mucho más eficiente
        .limit(pageSize)
        .skip(pageSize * (page - 1))
        .lean();
    
    res.json({ transactions, page, pages: Math.ceil(count / pageSize), totalTransactions: count });
});


// El resto de funciones (createManualTransaction, tools, settings, etc.) no requieren cambios.
const createManualTransaction = asyncHandler(async (req, res) => { const { userId, type, currency, amount, reason } = req.body; const session = await mongoose.startSession(); try { session.startTransaction(); const user = await User.findById(userId).session(session); if (!user) throw new Error('Usuario no encontrado.'); const currencyKey = currency.toLowerCase(); const originalBalance = user.balance[currencyKey] || 0; if (type === 'admin_credit') { user.balance[currencyKey] += amount; } else { if (originalBalance < amount) throw new Error('Saldo insuficiente para realizar el débito.'); user.balance[currencyKey] -= amount; } const updatedUser = await user.save({ session }); const transaction = new Transaction({ user: userId, type, currency, amount, description: reason, status: 'completed', metadata: { adminId: req.user._id.toString(), adminUsername: req.user.username, originalBalance: originalBalance.toString() } }); await transaction.save({ session }); await session.commitTransaction(); res.status(201).json({ message: 'Transacción manual creada.', user: updatedUser.toObject() }); } catch (error) { await session.abortTransaction(); res.status(500).json({ message: error.message }); } finally { session.endSession(); } });
const getDashboardStats = asyncHandler(async (req, res) => { const [totalUsers, totalDepositVolume] = await Promise.all([ User.countDocuments(), Transaction.aggregate([{ $match: { type: 'deposit', currency: 'USDT' } }, { $group: { _id: null, totalVolume: { $sum: '$amount' } } }]) ]); res.json({ totalUsers, totalDepositVolume: totalDepositVolume[0]?.totalVolume || 0 }); });
const getAllTools = asyncHandler(async (req, res) => { const tools = await Tool.find({}).sort({ vipLevel: 1 }).lean(); res.json(tools); });
const createTool = asyncHandler(async (req, res) => { const newTool = await Tool.create(req.body); res.status(201).json(newTool); });
const updateTool = asyncHandler(async (req, res) => { const tool = await Tool.findByIdAndUpdate(req.params.id, req.body, { new: true }); if (!tool) return res.status(404).json({ message: 'Herramienta no encontrada.' }); res.json(tool); });
const deleteTool = asyncHandler(async (req, res) => { const tool = await Tool.findById(req.params.id); if (!tool) return res.status(404).json({ message: 'Herramienta no encontrada.' }); await tool.deleteOne(); res.json({ message: 'Herramienta eliminada.' }); });
const getSettings = asyncHandler(async (req, res) => { const settings = await Setting.findOneAndUpdate({ singleton: 'global_settings' }, { $setOnInsert: { singleton: 'global_settings' } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean(); res.json(settings); });
const updateSettings = asyncHandler(async (req, res) => { const updatedSettings = await Setting.findOneAndUpdate({ singleton: 'global_settings' }, req.body, { new: true }); res.json(updatedSettings); });

module.exports = {
  getPendingWithdrawals, processWithdrawal, getAllUsers,
  updateUser, setUserStatus, getDashboardStats, getAllTransactions, createManualTransaction,
  getAllTools, createTool, updateTool, deleteTool, getUserDetails, getSettings,
  updateSettings,
};