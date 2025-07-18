// RUTA: backend/controllers/adminController.js (VERSIÓN DEFINITIVA Y COMPLETA v20.3 - BLINDADO)

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

const bscProvider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io',
    headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY }
});
const USDT_TRON_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDT_BSC_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const USDT_ABI = ['function balanceOf(address) view returns (uint256)'];
const usdtBscContract = new ethers.Contract(USDT_BSC_ADDRESS, USDT_ABI, bscProvider);

function promiseWithTimeout(promise, ms, timeoutMessage = 'Operación excedió el tiempo de espera.') {
  const timeout = new Promise((_, reject) => {
    const id = setTimeout(() => { clearTimeout(id); reject(new Error(timeoutMessage)); }, ms);
  });
  return Promise.race([promise, timeout]);
}

// =======================================================================================
// ========================== INICIO DE CONTROLADORES VARIOS =============================
// =======================================================================================

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
            notificationMessage = `✅ <b>¡Retiro Aprobado!</b>\n\nTu solicitud de retiro por <b>${amount.toFixed(2)} ${currency}</b> ha sido procesada.\n\n<b>Dirección:</b> <code>${recipientAddress}</code>`;
        } else {
            const userForRefund = await User.findById(withdrawal.user._id).session(session);
            if (!userForRefund) throw new Error('Usuario del retiro no encontrado para el reembolso.');
            userForRefund.balance.usdt += withdrawal.amount;
            await userForRefund.save({ session });
            withdrawal.status = 'rejected';
            withdrawal.description = `Retiro rechazado por admin. Fondos devueltos al saldo.`;
            notificationMessage = `❌ <b>Retiro Rechazado</b>\n\nTu solicitud de retiro por <b>${withdrawal.amount.toFixed(2)} USDT</b> ha sido rechazada.\n\n<b>Motivo:</b> ${adminNotes || 'Contacta a soporte.'}\n\nLos fondos han sido devueltos a tu saldo.`;
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
    res.json({ user: { ...user, photoUrl: userPhotoUrl || PLACEHOLDER_AVATAR_URL }, transactions, referrals: referralsWithPhoto });
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
        const transaction = new Transaction({ user: userId, type, currency, amount, description: reason, status: 'completed', metadata: { adminId: req.user._id.toString(), adminUsername: req.user.username } });
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
    if (verified) { user.isTwoFactorEnabled = true; await user.save(); res.json({ message: '¡2FA habilitado!' }); }
    else { res.status(400).json({ message: 'Token inválido.' }); }
});

// =======================================================================================
// ========================== INICIO DE TESORERÍA Y DISPENSADOR (PRODUCCIÓN) ===============
// =======================================================================================

async function _getBalancesForAddress(address, chain) {
    const TIMEOUT_MS = 15000;
    try {
        if (chain === 'BSC') {
            const [usdtBalanceRaw, bnbBalanceRaw] = await Promise.all([
                promiseWithTimeout(usdtBscContract.balanceOf(address), TIMEOUT_MS),
                promiseWithTimeout(bscProvider.getBalance(address), TIMEOUT_MS)
            ]);
            return { usdt: parseFloat(ethers.utils.formatUnits(usdtBalanceRaw, 18)), bnb: parseFloat(ethers.utils.formatEther(bnbBalanceRaw)), trx: 0 };
        } else if (chain === 'TRON') {
            const tempTronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io', headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY }, privateKey: '01'.repeat(32) });
            const usdtTronContract = await tempTronWeb.contract().at(USDT_TRON_ADDRESS);
            const [usdtBalanceRaw, trxBalanceRaw] = await Promise.all([
                promiseWithTimeout(usdtTronContract.balanceOf(address).call(), TIMEOUT_MS),
                promiseWithTimeout(tempTronWeb.trx.getBalance(address), TIMEOUT_MS)
            ]);
            return { usdt: parseFloat(ethers.utils.formatUnits(usdtBalanceRaw.toString(), 6)), trx: parseFloat(tronWeb.fromSun(trxBalanceRaw)), bnb: 0 };
        }
    } catch (error) {
        console.error(`Error al obtener saldo para ${address}: ${error.message}`);
        throw error;
    }
}

const getTreasuryWalletsList = asyncHandler(async (req, res) => {
    const wallets = await CryptoWallet.find({}).select('address chain user').populate('user', 'username').lean();
    res.json(wallets);
});

// --- NUEVA FUNCIÓN HELPER PARA ESTIMAR TARIFAS DE BARRIDO ---
async function _getEstimatedSweepFee(chain) {
    const GAS_BUFFER_PERCENTAGE = 1.01; // 1% de margen de seguridad

    if (chain === 'BSC') {
        const USDT_SWEEP_GAS_LIMIT = 80000; // Un límite de gas seguro para una transferencia de token BEP20
        const gasPrice = await bscProvider.getGasPrice();
        const estimatedFee = gasPrice.mul(USDT_SWEEP_GAS_LIMIT);
        const feeWithBuffer = estimatedFee.mul(125).div(100); // Aplicar buffer
        return parseFloat(ethers.utils.formatEther(feeWithBuffer));
    } else if (chain === 'TRON') {
        // Una transferencia de TRC20 consume energía, que se paga quemando TRX.
        // 30 TRX es un valor conservador y seguro para cubrir la mayoría de las transferencias.
        const TRX_SWEEP_FEE = 30; 
        return TRX_SWEEP_FEE * GAS_BUFFER_PERCENTAGE;
    }
    return 0;
}

const getWalletBalance = asyncHandler(async (req, res) => {
    const { address, chain } = req.body;
    if (!address || !chain) { res.status(400); throw new Error('Se requiere address y chain'); }
    try {
        const balances = await _getBalancesForAddress(address, chain);
        res.json({ success: true, balances });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

const sweepFunds = asyncHandler(async (req, res) => {
    const { chain, token, recipientAddress, walletsToSweep } = req.body;
    if (!chain || !token || !recipientAddress || !walletsToSweep || !Array.isArray(walletsToSweep)) {
        res.status(400); throw new Error("Parámetros de barrido inválidos.");
    }
    if (token.toUpperCase() !== 'USDT') {
        res.status(400); throw new Error("Solo se puede barrer USDT.");
    }
    
    const wallets = await CryptoWallet.find({ address: { $in: walletsToSweep }, chain: chain }).lean();
    if (wallets.length === 0) {
        return res.json({ message: "Wallets candidatas no encontradas.", summary: {}, details: [] });
    }

    const report = { summary: { walletsScanned: wallets.length, successfulSweeps: 0, skippedForNoGas: 0, skippedForNoToken: 0, failedTxs: 0, totalSwept: 0 }, details: [] };
    
    for (const wallet of wallets) {
        try {
            const balances = await _getBalancesForAddress(wallet.address, chain);
            const tokenBalance = balances.usdt;
            const gasBalance = chain === 'BSC' ? balances.bnb : balances.trx;
            const gasThreshold = chain === 'BSC' ? 0.0015 : 25;
            const sweepFunction = chain === 'BSC' ? transactionService.sweepUsdtOnBscFromDerivedWallet : transactionService.sweepUsdtOnTronFromDerivedWallet;
            
            if (tokenBalance <= 0.000001) { report.summary.skippedForNoToken++; report.details.push({ address: wallet.address, status: 'SKIPPED_NO_TOKEN', reason: 'Saldo de USDT es cero.' }); continue; }
            if (gasBalance < gasThreshold) { report.summary.skippedForNoGas++; report.details.push({ address: wallet.address, status: 'SKIPPED_NO_GAS', reason: `Gas insuficiente. Tienes ${gasBalance.toFixed(4)}, se requiere > ${gasThreshold}` }); continue; }
            
            const txHash = await sweepFunction(wallet.derivationIndex, recipientAddress);
            report.summary.successfulSweeps++;
            report.summary.totalSwept += tokenBalance;
            report.details.push({ address: wallet.address, status: 'SUCCESS', txHash, amount: tokenBalance });
        } catch (error) {
            report.summary.failedTxs++;
            report.details.push({ address: wallet.address, status: 'FAILED', reason: error.message });
        }
    }
    res.json(report);
});

const analyzeGasNeeds = asyncHandler(async (req, res) => {
    const { chain } = req.body;
    if (!['BSC', 'TRON'].includes(chain)) { res.status(400); throw new Error("Cadena no válida."); }
    
    let centralWalletBalance = 0;
    
    try {
        if (!process.env.MASTER_SEED_PHRASE || !ethers.utils.isValidMnemonic(process.env.MASTER_SEED_PHRASE)) {
            throw new Error("La variable MASTER_SEED_PHRASE no está definida o es inválida.");
        }
        
        if (chain === 'BSC') {
            const bscMasterNode = ethers.utils.HDNode.fromMnemonic(process.env.MASTER_SEED_PHRASE);
            const centralWallet = new ethers.Wallet(bscMasterNode.derivePath(`m/44'/60'/0'/0/0`).privateKey, bscProvider);
            centralWalletBalance = parseFloat(ethers.utils.formatEther(await bscProvider.getBalance(centralWallet.address)));
        } else { // TRON
            const tronMnemonicWallet = TronWeb.fromMnemonic(process.env.MASTER_SEED_PHRASE);
            centralWalletBalance = parseFloat(tronWeb.fromSun(await tronWeb.trx.getBalance(tronMnemonicWallet.address)));
        }

    } catch (error) {
        console.error("CRITICAL ERROR: Fallo al procesar la billetera central.", error.message);
        res.status(500);
        throw new Error("Fallo al procesar la billetera central. Verifique MASTER_SEED_PHRASE.");
    }
    
    // --- INICIO DE LA LÓGICA DE GAS PRECISO ---
    const requiredGasForSweep = await _getEstimatedSweepFee(chain);
    // --- FIN DE LA LÓGICA DE GAS PRECISO ---

    const walletsInChain = await CryptoWallet.find({ chain }).lean();
    const walletsNeedingGas = [];

    for (const wallet of walletsInChain) {
        try {
            const balances = await _getBalancesForAddress(wallet.address, chain);
            const gasBalance = chain === 'BSC' ? balances.bnb : balances.trx;
            
            // La condición ahora es: tiene USDT y su gas actual es MENOR que el requerido para el barrido.
            if (balances.usdt > 0.1 && gasBalance < requiredGasForSweep) {
                walletsNeedingGas.push({ 
                    address: wallet.address, 
                    usdtBalance: balances.usdt, 
                    gasBalance: gasBalance,
                    requiredGas: requiredGasForSweep // Añadimos la cantidad precisa que necesita
                });
            }
        } catch (error) {
            console.error(`No se pudo analizar la wallet ${wallet.address}: ${error.message}`);
        }
    }
    
    res.json({ centralWalletBalance, walletsNeedingGas });
});

const dispatchGas = asyncHandler(async (req, res) => {
    const { chain, targets } = req.body;
    if (!chain || !Array.isArray(targets) || targets.length === 0) { res.status(400); throw new Error("Petición inválida."); }

    const report = { summary: { success: 0, failed: 0, totalDispatched: 0 }, details: [] };
    const sendFunction = chain === 'BSC' ? transactionService.sendBscGas : transactionService.sendTronTrx;
    for (const target of targets) {
        try {
            const txHash = await sendFunction(target.address, target.amount);
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

// =======================================================================================
// ================================== EXPORTS FINALES ====================================
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
  getTreasuryWalletsList,
  getWalletBalance,
  sweepFunds,
  analyzeGasNeeds,
  dispatchGas
};