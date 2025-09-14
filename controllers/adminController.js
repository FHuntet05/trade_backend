// backend/controllers/adminController.js (FASE "REMEDIATIO" - RUTA DE MODELO CORREGIDA)

const User = require('../models/userModel');
// [REMEDIATIO - CORRECCIÓN CRÍTICA] Se corrige el nombre del modelo importado.
// El archivo se llama `toolModel.js` pero se usa como "Factory".
const Factory = require('../models/toolModel');
const Setting = require('../models/settingsModel');
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

// --- Constantes y Helpers ---
const PLACEHOLDER_AVATAR_URL = 'https://i.postimg.cc/mD21B6r7/user-avatar-placeholder.png';
const USDT_BSC_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const USDT_ABI = ['function balanceOf(address) view returns (uint256)'];
const GAS_SUFFICIENT_TOLERANCE = 0.000000001;

function promiseWithTimeout(promise, ms, timeoutMessage = 'Operación excedió el tiempo de espera.') {
    const timeout = new Promise((_, reject) => {
        const id = setTimeout(() => { clearTimeout(id); reject(new Error(timeoutMessage)); }, ms);
    });
    return Promise.race([promise, timeout]);
}

async function _getBalancesForAddress(address, chain) {
    if (chain !== 'BSC') {
        throw new Error(`Cadena no soportada: ${chain}. Solo se procesa BSC.`);
    }
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

// --- Endpoints del Dashboard ---
const getDashboardStats = asyncHandler(async (req, res) => {
    const totalDepositVolumePromise = User.aggregate([ { $unwind: '$transactions' }, { $match: { 'transactions.type': 'deposit' } }, { $group: { _id: null, total: { $sum: '$transactions.amount' } } } ]);
    const userGrowthDataPromise = User.aggregate([ { $match: { createdAt: { $gte: new Date(new Date().setDate(new Date().getDate() - 14)) } } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } } ]).then(data => data.map(item => ({ date: item._id, NuevosUsuarios: item.count })));
    const totalUsersPromise = User.countDocuments();
    const pendingWithdrawalsPromise = User.aggregate([ { $unwind: '$transactions' }, { $match: { 'transactions.type': 'withdrawal', 'transactions.status': 'pending' } }, { $count: 'total' } ]);
    const centralWalletBalancesPromise = (async () => {
        try {
            const { bscWallet } = transactionService.getCentralWallets();
            const balances = await _getBalancesForAddress(bscWallet.address, 'BSC');
            return { usdt: balances.usdt, bnb: balances.bnb };
        } catch (error) {
            console.error("Error al obtener balance de billetera central:", error);
            return { usdt: 0, bnb: 0 };
        }
    })();
    const [ totalUsers, totalDepositVolumeResult, pendingWithdrawalsResult, centralWalletBalances, userGrowthData ] = await Promise.all([ totalUsersPromise, totalDepositVolumePromise, pendingWithdrawalsPromise, centralWalletBalancesPromise, userGrowthDataPromise ]);
    const totalDepositVolume = totalDepositVolumeResult.length > 0 ? totalDepositVolumeResult[0].total : 0;
    const pendingWithdrawals = pendingWithdrawalsResult.length > 0 ? pendingWithdrawalsResult[0].total : 0;
    res.json({ totalUsers, totalDepositVolume, pendingWithdrawals, centralWalletBalances, userGrowthData });
});

// --- Gestión de Retiros ---
const getPendingWithdrawals = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const aggregationPipeline = [
        { $match: { 'transactions.type': 'withdrawal', 'transactions.status': 'pending' } },
        { $unwind: '$transactions' },
        { $match: { 'transactions.type': 'withdrawal', 'transactions.status': 'pending' } },
        { $sort: { 'transactions.createdAt': -1 } },
        {
            $project: {
                _id: '$transactions._id',
                grossAmount: { $abs: '$transactions.amount' },
                feeAmount: '$transactions.metadata.feeAmount',
                netAmount: '$transactions.metadata.netAmount',
                walletAddress: '$transactions.metadata.walletAddress',
                currency: '$transactions.currency',
                status: '$transactions.status',
                createdAt: '$transactions.createdAt',
                user: { _id: '$_id', username: '$username', telegramId: '$telegramId', photoFileId: '$photoFileId' }
            }
        }
    ];
    const countPipeline = [...aggregationPipeline, { $count: 'total' }];
    const paginatedPipeline = [...aggregationPipeline, { $skip: (page - 1) * limit }, { $limit: limit }];
    const [totalResult, paginatedItems] = await Promise.all([ User.aggregate(countPipeline), User.aggregate(paginatedPipeline) ]);
    const total = totalResult.length > 0 ? totalResult[0].total : 0;
    if (total === 0) return res.json({ withdrawals: [], page: 1, pages: 0, total: 0 });
    const withdrawalsWithDetails = await Promise.all(paginatedItems.map(async (w) => {
        const photoUrl = await getTemporaryPhotoUrl(w.user.photoFileId);
        return { ...w, user: { ...w.user, photoUrl: photoUrl || PLACEHOLDER_AVATAR_URL } };
    }));
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

// --- Gestión de Tesorería ---
const sweepFunds = asyncHandler(async (req, res) => {
    console.log('[Sweep] Solicitud de barrido de fondos recibida.');
    const { walletsToSweep } = req.body;
    const SWEEP_DESTINATION_WALLET = process.env.SWEEP_DESTINATION_WALLET;
    if (!SWEEP_DESTINATION_WALLET) {
        console.error('[CRITICAL] SWEEP_DESTINATION_WALLET no está configurada en .env');
        res.status(500);
        throw new Error('Error crítico de configuración de seguridad del servidor.');
    }
    if (!walletsToSweep || !Array.isArray(walletsToSweep) || walletsToSweep.length === 0) {
        res.status(400); throw new Error("Parámetro inválido. Se requiere 'walletsToSweep' (array).");
    }
    const wallets = await CryptoWallet.find({ address: { $in: walletsToSweep }, chain: 'BSC' }).lean();
    if (wallets.length === 0) {
        return res.json({ message: "Ninguna de las wallets candidatas fue encontrada...", summary: {}, details: [] });
    }
    const report = { summary: { walletsScanned: wallets.length, successfulSweeps: 0, failedSweeps: 0 }, details: [] };
    for (const wallet of wallets) {
        try {
            const txHash = await transactionService.sweepUsdtOnBscFromDerivedWallet(wallet.derivationIndex, SWEEP_DESTINATION_WALLET);
            report.summary.successfulSweeps++;
            report.details.push({ address: wallet.address, status: 'SUCCESS', txHash });
            console.log(`[Sweep] Éxito en barrido de ${wallet.address}. Hash: ${txHash}`);
        } catch (error) {
            report.summary.failedSweeps++;
            report.details.push({ address: wallet.address, status: 'FAILED', reason: error.message });
            console.error(`[Sweep] Fallo en barrido de ${wallet.address}: ${error.message}`);
        }
    }
    res.json(report);
});

const sweepGas = asyncHandler(async (req, res) => {
    console.log('[SweepGas] Solicitud de barrido de gas (BNB) recibida.');
    const { walletsToSweep } = req.body;
    const SWEEP_DESTINATION_WALLET = process.env.SWEEP_DESTINATION_WALLET;
    if (!SWEEP_DESTINATION_WALLET) {
        console.error('[CRITICAL] SWEEP_DESTINATION_WALLET no está configurada en .env');
        res.status(500); throw new Error('Error crítico de configuración de seguridad del servidor.');
    }
    if (!walletsToSweep || !Array.isArray(walletsToSweep) || walletsToSweep.length === 0) {
        res.status(400); throw new Error("Parámetro inválido. Se requiere 'walletsToSweep' (array).");
    }
    const wallets = await CryptoWallet.find({ address: { $in: walletsToSweep }, chain: 'BSC' }).lean();
    if (wallets.length === 0) {
        return res.json({ message: "Ninguna wallet candidata encontrada...", summary: {}, details: [] });
    }
    const report = { summary: { walletsScanned: wallets.length, successfulSweeps: 0, failedSweeps: 0 }, details: [] };
    for (const wallet of wallets) {
        try {
            const txHash = await transactionService.sweepBnbFromDerivedWallet(wallet.derivationIndex, SWEEP_DESTINATION_WALLET);
            report.summary.successfulSweeps++;
            report.details.push({ address: wallet.address, status: 'SUCCESS', txHash });
            console.log(`[SweepGas] Éxito en barrido de gas de ${wallet.address}. Hash: ${txHash}`);
        } catch (error) {
            report.summary.failedSweeps++;
            report.details.push({ address: wallet.address, status: 'FAILED', reason: error.message });
            console.error(`[SweepGas] Fallo en barrido de gas de ${wallet.address}: ${error.message}`);
        }
    }
    res.json(report);
});

const getTreasuryWalletsList = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const search = req.query.search || '';
    let query = { chain: 'BSC' };
    if (search) {
        const userQuery = { username: { $regex: search, $options: 'i' } };
        const users = await User.find(userQuery).select('_id');
        query.$or = [{ address: { $regex: search, $options: 'i' } }, { user: { $in: users.map(u => u._id) } }];
    }
    const [totalWallets, wallets] = await Promise.all([ CryptoWallet.countDocuments(query), CryptoWallet.find(query).populate('user', 'username').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean() ]);
    if (totalWallets === 0) { return res.json({ wallets: [], pagination: { currentPage: 1, totalPages: 0, totalWallets: 0 }, summary: { usdt: 0, bnb: 0 } }); }
    const walletsWithDetails = await Promise.all(wallets.map(async (wallet) => {
        try {
            const balances = await _getBalancesForAddress(wallet.address, wallet.chain);
            let estimatedRequiredGas = 0;
            if (balances.usdt > 0.000001) {
                estimatedRequiredGas = await gasEstimatorService.estimateBscSweepCost(wallet.address, balances.usdt);
            }
            return { ...wallet, usdtBalance: balances.usdt, gasBalance: balances.bnb, estimatedRequiredGas };
        } catch (error) {
            return { ...wallet, usdtBalance: 0, gasBalance: 0, estimatedRequiredGas: 0, error: `Fallo al obtener balance: ${error.message}` };
        }
    }));
    const summary = walletsWithDetails.reduce((acc, wallet) => {
        acc.usdt += wallet.usdtBalance || 0;
        acc.bnb += wallet.gasBalance || 0;
        return acc;
    }, { usdt: 0, bnb: 0 });
    res.json({ wallets: walletsWithDetails, pagination: { currentPage: page, totalPages: Math.ceil(totalWallets / limit), totalWallets }, summary });
});

// --- Dispensador de Gas ---
const analyzeGasNeeds = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const { bscWallet } = transactionService.getCentralWallets();
    const [totalWalletsInChain, balanceRaw] = await Promise.all([
        CryptoWallet.countDocuments({ chain: 'BSC' }),
        blockchainService.getBnbBalance(bscWallet.address)
    ]);
    const centralWalletBalance = parseFloat(ethers.utils.formatEther(balanceRaw));
    const walletsOnPage = await CryptoWallet.find({ chain: 'BSC' }).populate('user', 'username').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
    const walletsNeedingGasPromises = walletsOnPage.map(async (wallet) => {
        try {
            const balances = await _getBalancesForAddress(wallet.address, 'BSC');
            if (!balances || balances.usdt <= 0.000001) return null;
            const requiredGas = await gasEstimatorService.estimateBscSweepCost(wallet.address, balances.usdt);
            if (balances.bnb < requiredGas - GAS_SUFFICIENT_TOLERANCE) {
                return { address: wallet.address, user: wallet.user, usdtBalance: balances.usdt, gasBalance: balances.bnb, requiredGas };
            }
            return null;
        } catch (error) { return null; }
    });
    const filteredWallets = (await Promise.all(walletsNeedingGasPromises)).filter(Boolean);
    res.json({ centralWalletBalance, wallets: filteredWallets, pagination: { currentPage: page, totalPages: Math.ceil(totalWalletsInChain / limit), totalWallets: totalWalletsInChain } });
});

const dispatchGas = asyncHandler(async (req, res) => {
    const { chain, targets } = req.body;
    if (chain !== 'BSC' || !Array.isArray(targets) || targets.length === 0) { res.status(400); throw new Error("Petición inválida."); }
    const report = { summary: { success: 0, failed: 0, totalDispatched: 0 }, details: [] };
    for (const target of targets) {
        try {
            const txHash = await transactionService.sendBscGas(target.address, target.amount);
            report.summary.success++;
            report.summary.totalDispatched += parseFloat(target.amount);
            report.details.push({ address: target.address, status: 'SUCCESS', txHash, amount: target.amount });
        } catch (error) {
            report.summary.failed++;
            report.details.push({ address: target.address, status: 'FAILED', reason: error.message, amount: target.amount });
        }
    }
    res.json(report);
});

// --- Gestión de Usuarios ---
const getAllUsers = asyncHandler(async (req, res) => { const pageSize = 10; const page = Number(req.query.page) || 1; const filter = req.query.search ? { $or: [{ username: { $regex: req.query.search, $options: 'i' } }, { telegramId: { $regex: req.query.search, $options: 'i' } }] } : {}; const count = await User.countDocuments(filter); const users = await User.find(filter).select('username telegramId role status createdAt balance.usdt photoFileId').sort({ createdAt: -1 }).limit(pageSize).skip(pageSize * (page - 1)).lean(); const usersWithPhotoUrl = await Promise.all(users.map(async (user) => ({ ...user, photoUrl: await getTemporaryPhotoUrl(user.photoFileId) || PLACEHOLDER_AVATAR_URL }))); res.json({ users: usersWithPhotoUrl, page, pages: Math.ceil(count / pageSize), totalUsers: count }); });
const getUserDetails = asyncHandler(async (req, res) => { const { id } = req.params; const user = await User.findById(id).select('-password').lean(); if (!user) { res.status(404); throw new Error('Usuario no encontrado.'); } const referrals = await User.find({ referredBy: id }).select('username fullName telegramId photoFileId createdAt').lean(); const cryptoWallets = await CryptoWallet.find({ user: id }).lean(); const [userPhotoUrl, referralsWithPhoto] = await Promise.all([ getTemporaryPhotoUrl(user.photoFileId), Promise.all(referrals.map(async (ref) => ({ ...ref, photoUrl: await getTemporaryPhotoUrl(ref.photoFileId) || PLACEHOLDER_AVATAR_URL }))) ]); const page = parseInt(req.query.page) || 1; const limit = 10; const allTransactions = (user.transactions || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); const paginatedTransactions = allTransactions.slice((page - 1) * limit, page * limit); res.json({ user: { ...user, photoUrl: userPhotoUrl || PLACEHOLDER_AVATAR_URL }, referrals: referralsWithPhoto, cryptoWallets, transactions: { items: paginatedTransactions, page, totalPages: Math.ceil(allTransactions.length / limit), totalItems: allTransactions.length } }); });
const updateUser = asyncHandler(async (req, res) => { const { username, password, balanceUsdt, status, role } = req.body; const user = await User.findById(req.params.id); if (!user) { res.status(404); throw new Error('Usuario no encontrado.'); } user.username = username ?? user.username; user.balance.usdt = balanceUsdt ?? user.balance.usdt; user.status = status ?? user.status; user.role = role ?? user.role; if (password) { user.password = password; } const updatedUser = await user.save(); res.json(updatedUser); });
const adjustUserBalance = asyncHandler(async (req, res) => { const { id } = req.params; const { type, currency, amount, reason } = req.body; if (!['admin_credit', 'admin_debit'].includes(type) || currency !== 'USDT' || !amount || !reason) { res.status(400); throw new Error("Parámetros inválidos."); } const session = await mongoose.startSession(); try { session.startTransaction(); const user = await User.findById(id).session(session); if(!user) throw new Error('Usuario no encontrado'); if (type === 'admin_credit') { user.balance.usdt = (user.balance.usdt || 0) + amount; } else { if ((user.balance.usdt || 0) < amount) throw new Error('Saldo insuficiente para el débito.'); user.balance.usdt -= amount; } user.transactions.push({ type, amount: type === 'admin_credit' ? amount : -amount, currency, description: reason, status: 'completed', metadata: { adminUsername: req.user.username } }); await user.save({ session }); await session.commitTransaction(); res.status(200).json({ message: 'Saldo ajustado exitosamente.', user: user.toObject() }); } catch (error) { await session.abortTransaction(); res.status(500).json({ message: error.message }); } finally { session.endSession(); } });

// --- Gestión de Roles de Admin ---
const promoteUserToAdmin = asyncHandler(async (req, res) => { const { userId, password } = req.body; if (!userId || !password) { res.status(400); throw new Error('Se requiere userId y password.'); } const user = await User.findById(userId); if (!user) { res.status(404); throw new Error('Usuario no encontrado.'); } if (user.role === 'admin') { return res.status(400).json({ message: 'El usuario ya es un administrador.' }); } user.role = 'admin'; user.password = password; user.mustResetPassword = true; await user.save(); res.json({ message: `El usuario ${user.username} ha sido promovido a administrador.` }); });
const demoteAdminToUser = asyncHandler(async (req, res) => { const { adminId } = req.body; if (!adminId) { res.status(400); throw new Error('Se requiere el ID del administrador.'); } if (req.user.id === adminId) { res.status(400); throw new Error('No puedes degradarte a ti mismo.'); } const admin = await User.findById(adminId); if (!admin || admin.role !== 'admin') { res.status(404); throw new Error('Administrador no encontrado.'); } admin.role = 'user'; await admin.save(); res.json({ message: `El administrador ${admin.username} ha sido degradado a usuario.` }); });
const resetAdminPassword = asyncHandler(async (req, res) => { const { adminId } = req.body; if (!adminId) { res.status(400); throw new Error('Se requiere el ID del administrador.'); } const admin = await User.findById(adminId); if (!admin || admin.role !== 'admin') { res.status(404); throw new Error('Administrador no encontrado.'); } const temporaryPassword = crypto.randomBytes(8).toString('hex'); admin.password = temporaryPassword; admin.mustResetPassword = true; await admin.save(); res.json({ message: `Contraseña reseteada para ${admin.username}.`, temporaryPassword }); });

// --- Funciones de Utilidad (Configuraciones, 2FA, Notificaciones) ---
const getAllFactories = asyncHandler(async (req, res) => { const factories = await Factory.find({}).sort({ vipLevel: 1 }).lean(); res.json(factories); });
const createFactory = asyncHandler(async (req, res) => { const newFactory = await Factory.create(req.body); res.status(201).json(newFactory); });
const updateFactory = asyncHandler(async (req, res) => { const factory = await Factory.findByIdAndUpdate(req.params.id, req.body, { new: true }); if (!factory) return res.status(404).json({ message: 'Fábrica no encontrada.' }); res.json(factory); });
const deleteFactory = asyncHandler(async (req, res) => { await Factory.findByIdAndDelete(req.params.id); res.json({ message: 'Fábrica eliminada.' }); });
const getSettings = asyncHandler(async (req, res) => { const settings = await Setting.getSettings(); res.json(settings); });
const updateSettings = asyncHandler(async (req, res) => { const updatedSettings = await Setting.findOneAndUpdate({ singleton: 'global_settings' }, req.body, { new: true, upsert: true }); res.json(updatedSettings); });
const generateTwoFactorSecret = asyncHandler(async (req, res) => { const secret = speakeasy.generateSecret({ name: `BlockSphere Admin (${req.user.username})` }); await User.findByIdAndUpdate(req.user.id, { twoFactorSecret: secret.base32 }); const data_url = await qrCodeToDataURLPromise(secret.otpauth_url); res.json({ secret: secret.base32, qrCodeUrl: data_url }); });
const verifyAndEnableTwoFactor = asyncHandler(async (req, res) => { const { token } = req.body; const user = await User.findById(req.user.id).select('+twoFactorSecret'); if (!user || !user.twoFactorSecret) return res.status(400).json({ message: 'No se ha generado un secreto 2FA.' }); const verified = speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: 'base32', token }); if (verified) { user.isTwoFactorEnabled = true; await user.save(); res.json({ message: '¡2FA habilitado!' }); } else { res.status(400).json({ message: 'Token inválido.' }); }});
const sendBroadcastNotification = asyncHandler(async (req, res) => { const { message, target, imageUrl, buttons } = req.body; let usersToNotify; if (target.type === 'all') { usersToNotify = await User.find({ status: 'active' }).select('telegramId').lean(); } else if (target.type === 'id' && target.value) { const user = await User.findOne({ telegramId: target.value }).select('telegramId').lean(); usersToNotify = user ? [user] : []; } if (!usersToNotify || usersToNotify.length === 0) return res.json({ message: "No se encontraron usuarios para notificar." }); res.status(202).json({ message: `Enviando notificación a ${usersToNotify.length} usuarios.` }); (async () => { let successCount = 0; for (const user of usersToNotify) { if (user.telegramId) { const result = await sendTelegramMessage(user.telegramId, message, { imageUrl, buttons }); if (result.success) successCount++; await new Promise(resolve => setTimeout(resolve, 100)); } } console.log(`[Broadcast] Notificación completada. ${successCount}/${usersToNotify.length} envíos exitosos.`); })(); });

// --- Exportación de Módulos ---
module.exports = {
  getPendingWithdrawals, processWithdrawal, getAllUsers, updateUser, getDashboardStats,
  getAllFactories, createFactory, updateFactory, deleteFactory, getUserDetails, getSettings,
  updateSettings, generateTwoFactorSecret, verifyAndEnableTwoFactor, getTreasuryWalletsList,
  sweepFunds, analyzeGasNeeds, dispatchGas, adjustUserBalance, sendBroadcastNotification,
  sweepGas, promoteUserToAdmin, demoteAdminToUser, resetAdminPassword
};