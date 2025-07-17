// backend/controllers/adminController.js (VERSIÓN v18.2 - BLINDADO CON TIMEOUTS)

const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');
const Tool = require('../models/toolModel');
const Setting = require('../models/settingsModel');
const CryptoWallet = require('../models/cryptoWalletModel');
const mongoose = require('mongoose');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { getTemporaryPhotoUrl } = require('./userController'); 
const asyncHandler = require('express-async-handler');
const { sendTelegramMessage } = require('../services/notificationService');
const transactionService = require('../services/transactionService');
const { ethers } = require('ethers');
const TronWeb = require('tronweb').default.TronWeb;

const qrCodeToDataURLPromise = require('util').promisify(QRCode.toDataURL);
const PLACEHOLDER_AVATAR_URL = 'https://i.ibb.co/606BFx4/user-avatar-placeholder.png';

// --- CONSTANTES DE BLOCKCHAIN ---
const bscProvider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io',
    headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY }
});
const USDT_TRON_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDT_BSC_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const USDT_ABI = ['function balanceOf(address) view returns (uint256)'];
const usdtBscContract = new ethers.Contract(USDT_BSC_ADDRESS, USDT_ABI, bscProvider);

// --- FUNCIÓN DE BLINDAJE CON TIMEOUT (AÑADIDA) ---
function promiseWithTimeout(promise, ms, timeoutMessage = 'Operación excedió el tiempo de espera.') {
  const timeout = new Promise((_, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      reject(new Error(timeoutMessage));
    }, ms);
  });
  return Promise.race([promise, timeout]);
}

// --- TODAS LAS FUNCIONES CONTROLADORAS EXISTENTES ---
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
        return w;
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

const getUserDetails = asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) { res.status(400); throw new Error('ID de usuario no válido.'); }
    const userId = new mongoose.Types.ObjectId(req.params.id);
    const [user, transactions, referrals] = await Promise.all([
        User.findById(userId).select('-password').lean(),
        Transaction.find({ user: userId }).sort({ createdAt: -1 }).limit(10).lean(),
        User.find({ referredBy: userId }).select('username fullName telegramId photoFileId createdAt').lean()
    ]);
    if (!user) { res.status(404); throw new Error('Usuario no encontrado.'); }
    const [userPhotoUrl, referralsWithPhoto] = await Promise.all([
        getTemporaryPhotoUrl(user.photoFileId),
        Promise.all(referrals.map(async (ref) => {
            const photoUrl = await getTemporaryPhotoUrl(ref.photoFileId);
            return { ...ref, photoUrl: photoUrl || PLACEHOLDER_AVATAR_URL };
        }))
    ]);
    res.json({
        user: { ...user, photoUrl: userPhotoUrl || PLACEHOLDER_AVATAR_URL },
        transactions,
        referrals: referralsWithPhoto
    });
});

const getAllUsers = asyncHandler(async (req, res) => {
    const pageSize = 10; const page = Number(req.query.page) || 1;
    const filter = req.query.search ? { $or: [{ username: { $regex: req.query.search, $options: 'i' } }, { telegramId: { $regex: req.query.search, $options: 'i' } }] } : {};
    const count = await User.countDocuments(filter);
    const users = await User.find(filter).select('username telegramId role status createdAt balance.usdt photoFileId').sort({ createdAt: -1 }).limit(pageSize).skip(pageSize * (page - 1)).lean();
    const usersWithPhotoUrl = await Promise.all(users.map(async (user) => ({ ...user, photoUrl: await getTemporaryPhotoUrl(user.photoFileId) || PLACEHOLDER_AVATAR_URL })));
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
    const pageSize = 15; const page = Number(req.query.page) || 1; let filter = {};
    if (req.query.type) { filter.type = req.query.type; }
    if (req.query.search) {
        const usersFound = await User.find({ $or: [{ username: { $regex: req.query.search, $options: 'i' } }, { telegramId: { $regex: req.query.search, $options: 'i' } }] }).select('_id');
        filter.user = { $in: usersFound.map(user => user._id) };
    }
    const count = await Transaction.countDocuments(filter);
    const transactions = await Transaction.find(filter).sort({ createdAt: -1 }).populate('user', 'username telegramId').limit(pageSize).skip(pageSize * (page - 1)).lean();
    res.json({ transactions, page, pages: Math.ceil(count / pageSize), totalTransactions: count });
});

const createManualTransaction = asyncHandler(async (req, res) => {
    const { userId, type, currency, amount, reason } = req.body;
    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        const user = await User.findById(userId).session(session);
        if (!user) throw new Error('Usuario no encontrado.');
        const currencyKey = currency.toLowerCase(); const originalBalance = user.balance[currencyKey] || 0;
        if (type === 'admin_credit') { user.balance[currencyKey] += amount; }
        else { if (originalBalance < amount) throw new Error('Saldo insuficiente para realizar el débito.'); user.balance[currencyKey] -= amount; }
        const updatedUser = await user.save({ session });
        const transaction = new Transaction({ user: userId, type, currency, amount, description: reason, status: 'completed', metadata: { adminId: req.user._id.toString(), adminUsername: req.user.username, originalBalance: originalBalance.toString() } });
        await transaction.save({ session });
        await session.commitTransaction();
        res.status(201).json({ message: 'Transacción manual creada.', user: updatedUser.toObject() });
    } catch (error) {
        await session.abortTransaction(); res.status(500).json({ message: error.message });
    } finally {
        session.endSession();
    }
});

const getDashboardStats = asyncHandler(async (req, res) => {
    const [totalUsers, totalDepositVolume] = await Promise.all([User.countDocuments(), Transaction.aggregate([{ $match: { type: 'deposit', currency: 'USDT' } }, { $group: { _id: null, totalVolume: { $sum: '$amount' } } }])]);
    res.json({ totalUsers, totalDepositVolume: totalDepositVolume[0]?.totalVolume || 0 });
});

const getAllTools = asyncHandler(async (req, res) => { const tools = await Tool.find({}).sort({ vipLevel: 1 }).lean(); res.json(tools); });
const createTool = asyncHandler(async (req, res) => { const newTool = await Tool.create(req.body); res.status(201).json(newTool); });
const updateTool = asyncHandler(async (req, res) => { const tool = await Tool.findByIdAndUpdate(req.params.id, req.body, { new: true }); if (!tool) return res.status(404).json({ message: 'Herramienta no encontrada.' }); res.json(tool); });
const deleteTool = asyncHandler(async (req, res) => { const tool = await Tool.findById(req.params.id); if (!tool) return res.status(404).json({ message: 'Herramienta no encontrada.' }); await tool.deleteOne(); res.json({ message: 'Herramienta eliminada.' }); });
const getSettings = asyncHandler(async (req, res) => { const settings = await Setting.findOneAndUpdate({ singleton: 'global_settings' }, { $setOnInsert: { singleton: 'global_settings' } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean(); res.json(settings); });
const updateSettings = asyncHandler(async (req, res) => { const updatedSettings = await Setting.findOneAndUpdate({ singleton: 'global_settings' }, req.body, { new: true }); res.json(updatedSettings); });

const generateTwoFactorSecret = asyncHandler(async (req, res) => {
    const secret = speakeasy.generateSecret({ name: `NeuroLink Admin (${req.user.username})` });
    await User.findByIdAndUpdate(req.user.id, { twoFactorSecret: secret.base32 });
    const data_url = await qrCodeToDataURLPromise(secret.otpauth_url);
    res.json({ secret: secret.base32, qrCodeUrl: data_url });
});

const verifyAndEnableTwoFactor = asyncHandler(async (req, res) => {
    const { token } = req.body;
    const user = await User.findById(req.user.id).select('+twoFactorSecret');
    if (!user || !user.twoFactorSecret) return res.status(400).json({ message: 'No se ha generado un secreto 2FA.' });
    const verified = speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: 'base32', token });
    if (verified) {
        user.isTwoFactorEnabled = true;
        await user.save();
        res.json({ message: '¡2FA habilitado!' });
    } else {
        res.status(400).json({ message: 'Token inválido.' });
    }
});

// =======================================================================================
// ==================== INICIO DE LA FUNCIONALIDAD DE TESORERÍA v18.2 =====================
// =======================================================================================

const getTreasuryData = asyncHandler(async (req, res) => {
    const usdtTronContract = await tronWeb.contract().at(USDT_TRON_ADDRESS);
    const wallets = await CryptoWallet.find({}).populate('user', 'username telegramId').lean();
    
    // CORRECCIÓN: Hemos añadido TIMEOUTS a todas las llamadas externas a la blockchain.
    const TIMEOUT_MS = 15000; // 15 segundos de tiempo de espera

    const balancePromises = wallets.map(async (wallet) => {
        try {
            if (wallet.chain === 'BSC') {
                const [usdtBalanceRaw, bnbBalanceRaw] = await Promise.all([
                    promiseWithTimeout(usdtBscContract.balanceOf(wallet.address), TIMEOUT_MS),
                    promiseWithTimeout(bscProvider.getBalance(wallet.address), TIMEOUT_MS)
                ]);
                return {
                    ...wallet,
                    balances: {
                        usdt: parseFloat(ethers.utils.formatUnits(usdtBalanceRaw, 18)),
                        bnb: parseFloat(ethers.utils.formatEther(bnbBalanceRaw)),
                        trx: 0,
                    }
                };
            } else if (wallet.chain === 'TRON') {
                const [usdtBalanceRaw, trxBalanceRaw] = await Promise.all([
                    promiseWithTimeout(usdtTronContract.balanceOf(wallet.address).call(), TIMEOUT_MS),
                    promiseWithTimeout(tronWeb.trx.getBalance(wallet.address), TIMEOUT_MS)
                ]);
                return {
                    ...wallet,
                    balances: {
                        usdt: parseFloat(ethers.utils.formatUnits(usdtBalanceRaw.toString(), 6)),
                        trx: parseFloat(tronWeb.fromSun(trxBalanceRaw)),
                        bnb: 0
                    }
                };
            }
        } catch (error) {
            console.error(`Error (posible timeout) al consultar saldo para ${wallet.address}:`, error.message);
            return { ...wallet, balances: { usdt: 0, bnb: 0, trx: 0 }, error: true, errorMessage: error.message };
        }
        return null;
    });

    const settledWallets = await Promise.allSettled(balancePromises);
    const summary = { totalUsdt: 0, totalBnb: 0, totalTrx: 0 };
    const walletsWithBalance = [];
    settledWallets.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
            const wallet = result.value;
            const { usdt, bnb, trx } = wallet.balances;
            if (usdt > 0 || bnb > 0 || trx > 0) {
                summary.totalUsdt += usdt;
                summary.totalBnb += bnb;
                summary.totalTrx += trx;
                walletsWithBalance.push({
                    address: wallet.address, chain: wallet.chain,
                    balances: { usdt: usdt.toFixed(6), bnb: bnb.toFixed(6), trx: trx.toFixed(6), },
                    user: wallet.user ? { username: wallet.user.username, telegramId: wallet.user.telegramId } : { username: 'Usuario no asignado', telegramId: 'N/A' }
                });
            }
        }
    });
    res.json({
        summary: { usdt: summary.totalUsdt.toFixed(6), bnb: summary.totalBnb.toFixed(6), trx: summary.totalTrx.toFixed(6), },
        wallets: walletsWithBalance
    });
});

const sweepFunds = asyncHandler(async (req, res) => {
    const { chain, token, recipientAddress } = req.body;
    if (!chain || !token || !recipientAddress) {
        res.status(400); throw new Error("Se requieren 'chain', 'token' y 'recipientAddress'.");
    }
    if (token.toUpperCase() !== 'USDT') {
        res.status(400); throw new Error("Actualmente, solo se puede barrer USDT.");
    }
    const wallets = await CryptoWallet.find({ chain }).lean();
    if (wallets.length === 0) {
        return res.json({ message: "No se encontraron wallets para la cadena especificada.", summary: {}, details: [] });
    }
    const report = {
        summary: { walletsScanned: wallets.length, successfulSweeps: 0, skippedForNoGas: 0, skippedForNoToken: 0, failedTxs: 0, totalSwept: 0, },
        details: [],
    };
    const usdtTronContract = await tronWeb.contract().at(USDT_TRON_ADDRESS);
    for (const wallet of wallets) {
        try {
            let tokenBalance, gasBalance, gasThreshold, sweepFunction;
            if (chain === 'BSC') {
                const [tokenBalanceRaw, gasBalanceRaw] = await Promise.all([ usdtBscContract.balanceOf(wallet.address), bscProvider.getBalance(wallet.address) ]);
                tokenBalance = parseFloat(ethers.utils.formatUnits(tokenBalanceRaw, 18));
                gasBalance = parseFloat(ethers.utils.formatEther(gasBalanceRaw));
                gasThreshold = 0.0015;
                sweepFunction = transactionService.sweepUsdtOnBscFromDerivedWallet;
            } else {
                const [tokenBalanceRaw, gasBalanceRaw] = await Promise.all([ usdtTronContract.balanceOf(wallet.address).call(), tronWeb.trx.getBalance(wallet.address) ]);
                tokenBalance = parseFloat(ethers.utils.formatUnits(tokenBalanceRaw.toString(), 6));
                gasBalance = parseFloat(tronWeb.fromSun(gasBalanceRaw));
                gasThreshold = 25;
                sweepFunction = transactionService.sweepUsdtOnTronFromDerivedWallet;
            }
            if (tokenBalance <= 0.000001) {
                report.summary.skippedForNoToken++;
                report.details.push({ address: wallet.address, status: 'SKIPPED_NO_TOKEN', reason: 'Saldo de USDT es cero.' });
                continue;
            }
            if (gasBalance < gasThreshold) {
                report.summary.skippedForNoGas++;
                report.details.push({ address: wallet.address, status: 'SKIPPED_NO_GAS', reason: `Gas insuficiente. Se requieren > ${gasThreshold}, se tienen ${gasBalance}.` });
                continue;
            }
            console.log(`[SweepFunds] Intentando barrer ${tokenBalance} USDT desde ${wallet.address}`);
            const txHash = await sweepFunction(wallet.derivationIndex, recipientAddress);
            report.summary.successfulSweeps++;
            report.summary.totalSwept += tokenBalance;
            report.details.push({ address: wallet.address, status: 'SUCCESS', txHash });
        } catch (error) {
            console.error(`[SweepFunds] Fallo al barrer la wallet ${wallet.address}:`, error);
            report.summary.failedTxs++;
            report.details.push({ address: wallet.address, status: 'FAILED', reason: error.message });
        }
    }
    res.json(report);
});

// =======================================================================================
// ===================== FIN DE LA FUNCIONALIDAD DE TESORERÍA v18.2 ======================
// =======================================================================================

module.exports = {
  getPendingWithdrawals,
  processWithdrawal,
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
  getTreasuryData,
  sweepFunds,
};