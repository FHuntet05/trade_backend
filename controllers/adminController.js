// RUTA: backend/controllers/adminController.js (VERSIÓN "NEXUS - REPORTING OVERHAUL - COMPLETA")
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

// --- Constantes y Helpers (sin cambios) ---
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

// --- Endpoints del Dashboard (sin cambios) ---
const getDashboardStats = asyncHandler(async (req, res) => {
  const totalDepositVolumePromise = User.aggregate([ { $unwind: '$transactions' }, { $match: { 'transactions.type': 'deposit' } }, { $group: { _id: null, total: { $sum: '$transactions.amount' } } } ]);
  const userGrowthDataPromise = User.aggregate([ { $match: { createdAt: { $gte: new Date(new Date().setDate(new Date().getDate() - 14)) } } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } } ]).then(data => data.map(item => ({ date: item._id, NuevosUsuarios: item.count })));
  const totalUsersPromise = User.countDocuments();
  const pendingWithdrawalsPromise = User.aggregate([ { $unwind: '$transactions' }, { $match: { 'transactions.type': 'withdrawal', 'transactions.status': 'pending' } }, { $count: 'total' } ]);
  const centralWalletBalancesPromise = (async () => { try { const { bscWallet } = transactionService.getCentralWallets(); const balances = await _getBalancesForAddress(bscWallet.address, 'BSC'); return { usdt: balances.usdt, bnb: balances.bnb }; } catch (error) { console.error("Error al obtener balance de billetera central:", error); return { usdt: 0, bnb: 0 }; } })();
  const [ totalUsers, totalDepositVolumeResult, pendingWithdrawalsResult, centralWalletBalances, userGrowthData ] = await Promise.all([ totalUsersPromise, totalDepositVolumePromise, pendingWithdrawalsPromise, centralWalletBalancesPromise, userGrowthDataPromise ]);
  const totalDepositVolume = totalDepositVolumeResult.length > 0 ? totalDepositVolumeResult[0].total : 0;
  const pendingWithdrawals = pendingWithdrawalsResult.length > 0 ? pendingWithdrawalsResult[0].total : 0;
  res.json({ totalUsers, totalDepositVolume, pendingWithdrawals, centralWalletBalances, userGrowthData });
});

// --- Gestión de Retiros (sin cambios) ---
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
        feeAmount: { $ifNull: [ { $toDouble: '$transactions.metadata.feeAmount' }, 0 ] },
        netAmount: { $ifNull: [ { $toDouble: '$transactions.metadata.netAmount' }, 0 ] },
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

// --- Tesorería (sin cambios) ---
const sweepFunds = asyncHandler(async (req, res) => {
  const { walletsToSweep } = req.body;
  const SWEEP_DESTINATION_WALLET = process.env.SWEEP_DESTINATION_WALLET;
  if (!SWEEP_DESTINATION_WALLET) { res.status(500); throw new Error('Error crítico de configuración de seguridad del servidor.'); }
  if (!walletsToSweep || !Array.isArray(walletsToSweep) || walletsToSweep.length === 0) { res.status(400); throw new Error("Parámetro inválido. Se requiere 'walletsToSweep' (array)."); }
  const wallets = await CryptoWallet.find({ address: { $in: walletsToSweep }, chain: 'BSC' }).lean();
  if (wallets.length === 0) { return res.json({ message: "Ninguna de las wallets candidatas fue encontrada...", summary: {}, details: [] }); }
  const report = { summary: { walletsScanned: wallets.length, successfulSweeps: 0, failedSweeps: 0 }, details: [] };
  for (const wallet of wallets) { try { const txHash = await transactionService.sweepUsdtOnBscFromDerivedWallet(wallet.derivationIndex, SWEEP_DESTINATION_WALLET); report.summary.successfulSweeps++; report.details.push({ address: wallet.address, status: 'SUCCESS', txHash }); } catch (error) { report.summary.failedSweeps++; report.details.push({ address: wallet.address, status: 'FAILED', reason: error.message }); } }
  res.json(report);
});

const sweepGas = asyncHandler(async (req, res) => {
  const { walletsToSweep } = req.body;
  const SWEEP_DESTINATION_WALLET = process.env.SWEEP_DESTINATION_WALLET;
  if (!SWEEP_DESTINATION_WALLET) { res.status(500); throw new Error('Error crítico de configuración de seguridad del servidor.'); }
  if (!walletsToSweep || !Array.isArray(walletsToSweep) || walletsToSweep.length === 0) { res.status(400); throw new Error("Parámetro inválido. Se requiere 'walletsToSweep' (array)."); }
  const wallets = await CryptoWallet.find({ address: { $in: walletsToSweep }, chain: 'BSC' }).lean();
  if (wallets.length === 0) { return res.json({ message: "Ninguna wallet candidata encontrada...", summary: {}, details: [] }); }
  const report = { summary: { walletsScanned: wallets.length, successfulSweeps: 0, failedSweeps: 0 }, details: [] };
  for (const wallet of wallets) { try { const txHash = await transactionService.sweepBnbFromDerivedWallet(wallet.derivationIndex, SWEEP_DESTINATION_WALLET); report.summary.successfulSweeps++; report.details.push({ address: wallet.address, status: 'SUCCESS', txHash }); } catch (error) { report.summary.failedSweeps++; report.details.push({ address: wallet.address, status: 'FAILED', reason: error.message }); } }
  res.json(report);
});

const getTreasuryWalletsList = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 15;
  const search = req.query.search || '';
  let query = { chain: 'BSC' };
  if (search) { const userQuery = { username: { $regex: search, $options: 'i' } }; const users = await User.find(userQuery).select('_id'); query.$or = [{ address: { $regex: search, $options: 'i' } }, { user: { $in: users.map(u => u._id) } }]; }
  const [totalWallets, wallets] = await Promise.all([ CryptoWallet.countDocuments(query), CryptoWallet.find(query).populate('user', 'username').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean() ]);
  if (totalWallets === 0) { return res.json({ wallets: [], pagination: { currentPage: 1, totalPages: 0, totalWallets: 0 }, summary: { usdt: 0, bnb: 0 } }); }
  const walletsWithDetails = await Promise.all(wallets.map(async (wallet) => { try { const balances = await _getBalancesForAddress(wallet.address, wallet.chain); let estimatedRequiredGas = 0; if (balances.usdt > 0.000001) { estimatedRequiredGas = await gasEstimatorService.estimateBscSweepCost(wallet.address, balances.usdt); } return { ...wallet, usdtBalance: balances.usdt, gasBalance: balances.bnb, estimatedRequiredGas }; } catch (error) { return { ...wallet, usdtBalance: 0, gasBalance: 0, estimatedRequiredGas: 0, error: `Fallo al obtener balance: ${error.message}` }; } }));
  const summary = walletsWithDetails.reduce((acc, wallet) => { acc.usdt += wallet.usdtBalance || 0; acc.bnb += wallet.gasBalance || 0; return acc; }, { usdt: 0, bnb: 0 });
  res.json({ wallets: walletsWithDetails, pagination: { currentPage: page, totalPages: Math.ceil(totalWallets / limit), totalWallets }, summary });
});

const analyzeGasNeeds = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 15;
  const { bscWallet } = transactionService.getCentralWallets();
  const [totalWalletsInChain, balanceRaw] = await Promise.all([ CryptoWallet.countDocuments({ chain: 'BSC' }), blockchainService.getBnbBalance(bscWallet.address) ]);
  const centralWalletBalance = parseFloat(ethers.utils.formatEther(balanceRaw));
  const walletsOnPage = await CryptoWallet.find({ chain: 'BSC' }).populate('user', 'username').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
  const walletsNeedingGasPromises = walletsOnPage.map(async (wallet) => { try { const balances = await _getBalancesForAddress(wallet.address, 'BSC'); if (!balances || balances.usdt <= 0.000001) return null; const requiredGas = await gasEstimatorService.estimateBscSweepCost(wallet.address, balances.usdt); if (balances.bnb < requiredGas - GAS_SUFFICIENT_TOLERANCE) { return { address: wallet.address, user: wallet.user, usdtBalance: balances.usdt, gasBalance: balances.bnb, requiredGas }; } return null; } catch (error) { return null; } });
  const filteredWallets = (await Promise.all(walletsNeedingGasPromises)).filter(Boolean);
  res.json({ centralWalletBalance, wallets: filteredWallets, pagination: { currentPage: page, totalPages: Math.ceil(totalWalletsInChain / limit), totalWallets: totalWalletsInChain } });
});

const dispatchGas = asyncHandler(async (req, res) => {
  const { chain, targets } = req.body;
  if (chain !== 'BSC' || !Array.isArray(targets) || targets.length === 0) { res.status(400); throw new Error("Petición inválida."); }
  const report = { summary: { success: 0, failed: 0, totalDispatched: 0 }, details: [] };
  for (const target of targets) { try { const txHash = await transactionService.sendBscGas(target.address, target.amount); report.summary.success++; report.summary.totalDispatched += parseFloat(target.amount); report.details.push({ address: target.address, status: 'SUCCESS', txHash, amount: target.amount }); } catch (error) { report.summary.failed++; report.details.push({ address: target.address, status: 'FAILED', reason: error.message, amount: target.amount }); } }
  res.json(report);
});

// --- Gestión de Usuarios (sin cambios) ---
const getAllUsers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const search = req.query.search || '';
  let query = {};
  if (search) query.username = { $regex: search, $options: 'i' };
  const totalUsers = await User.countDocuments(query);
  const users = await User.find(query).select('-password').skip((page - 1) * limit).limit(limit).lean();
  const usersWithPhoto = await Promise.all(users.map(async (user) => { const photoUrl = await getTemporaryPhotoUrl(user.photoFileId); return { ...user, photoUrl: photoUrl || PLACEHOLDER_AVATAR_URL }; }));
  res.json({ users: usersWithPhoto, pagination: { currentPage: page, totalPages: Math.ceil(totalUsers / limit), totalUsers } });
});

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

// [NEXUS REPORTING OVERHAUL] - INICIO DE LA REFACTORIZACIÓN CRÍTICA
const getAllTransactions = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const search = req.query.search || '';
    const type = req.query.type || '';

    // 1. Etapa de 'match' para filtrar transacciones DESPUÉS de ser aplanadas.
    // Esta es la lógica correcta: se construye el filtro para aplicar sobre la lista global.
    const matchStage = {};
    if (type) {
        matchStage.type = type;
    }
    if (search) {
        // Buscamos en el nombre de usuario anidado o en la descripción de la transacción.
        matchStage.$or = [
            { 'user.username': { $regex: search, $options: 'i' } },
            { 'description': { $regex: search, $options: 'i' } }
        ];
    }

    // 2. Reconstrucción completa de la Aggregation Pipeline (Arquitectura Correcta).
    const aggregationPipeline = [
        // ETAPA 1: Desenrollar TODAS las transacciones de TODOS los usuarios en una lista plana.
        // Este es el paso más crucial. Ahora operamos sobre transacciones, no sobre usuarios.
        { $unwind: '$transactions' },

        // ETAPA 2: Reemplazar la raíz del documento.
        // Promovemos la transacción al nivel superior y adjuntamos la info del usuario.
        // Esto crea un documento limpio por cada transacción.
        {
            $replaceRoot: {
                newRoot: {
                    $mergeObjects: [
                        '$transactions',
                        { user: { _id: '$_id', username: '$username' } }
                    ]
                }
            }
        },

        // ETAPA 3: Ordenar la lista global de transacciones por fecha de creación.
        // Es importante ordenar ANTES de filtrar y paginar para consistencia.
        { $sort: { createdAt: -1 } },

        // ETAPA 4: Aplicar los filtros de búsqueda y tipo sobre la lista plana.
        // Si matchStage está vacío, esta etapa no hace nada, devolviendo todas las transacciones.
        { $match: matchStage },

        // ETAPA 5: Utilizar $facet para ejecutar la paginación y el conteo total en una sola pasada.
        // Esto es mucho más eficiente que ejecutar dos queries separadas.
        {
            $facet: {
                // Rama para los metadatos (conteo total)
                metadata: [{ $count: 'total' }],
                // Rama para los datos de la página actual
                data: [{ $skip: (page - 1) * limit }, { $limit: limit }]
            }
        }
    ];

    const result = await User.aggregate(aggregationPipeline);

    // 3. Extraer y formatear los resultados del $facet.
    const transactions = result[0].data;
    const total = result[0].metadata.length > 0 ? result[0].metadata[0].total : 0;
    
    res.json({
        transactions: transactions || [],
        page,
        pages: Math.ceil(total / limit),
        total
    });
});
// [NEXUS REPORTING OVERHAUL] - FIN DE LA REFACTORIZACIÓN CRÍTICA

// --- Fábricas y Ajustes (sin cambios) ---
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