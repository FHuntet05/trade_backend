// backend/controllers/adminController.js (VERSIÓN v17.1 - IMPORTACIÓN CORREGIDA)
const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');
const Tool = require('../models/toolModel');
const Setting = require('../models/settingsModel');
const mongoose = require('mongoose');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const transactionService = require('../services/transactionService');
// CORRECCIÓN v17.1: Se añade la importación que faltaba.
const { getTemporaryPhotoUrl } = require('./userController'); 
const asyncHandler = require('express-async-handler');

const qrCodeToDataURLPromise = require('util').promisify(QRCode.toDataURL);
const PLACEHOLDER_AVATAR_URL = 'https://i.ibb.co/606BFx4/user-avatar-placeholder.png';

// =================================================================
// FUNCIÓN #3: OBTENER RETIROS PENDIENTES (Página de "Retiros")
// =================================================================
const getPendingWithdrawals = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    const filter = { type: 'withdrawal', status: 'pending' };

    const total = await Transaction.countDocuments(filter);
    const withdrawals = await Transaction.find(filter)
        .populate('user', 'username telegramId photoFileId') // Populate es aceptable aquí porque la lista es pequeña
        .sort({ createdAt: 'desc' })
        .limit(limit)
        .skip(limit * (page - 1))
        .lean();

    // Enriquecer con fotos
    const withdrawalsWithPhoto = await Promise.all(withdrawals.map(async w => ({
        ...w,
        user: {
            ...w.user,
            photoUrl: await getTemporaryPhotoUrl(w.user.photoFileId) || PLACEHOLDER_AVATAR_URL
        }
    })));

    res.json({
      withdrawals: withdrawalsWithPhoto,
      page,
      pages: Math.ceil(total / limit),
      total
    });
});


// =================================================================
// FUNCIÓN #4: PROCESAR UN RETIRO (Aprobar/Rechazar)
// =================================================================
const processWithdrawal = asyncHandler(async (req, res) => {
    // TODO: Implementar la lógica para procesar el retiro y enviar notificación
    // Esta será nuestra próxima tarea.
    const { status } = req.body;
    res.status(200).json({ message: `Funcionalidad para marcar retiro como '${status}' pendiente de implementación.` });
});


const getUserReferrals = async (req, res) => {
    try {
        const userId = req.params.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: "ID de usuario no válido." });
        }

        const filter = { referredBy: new mongoose.Types.ObjectId(userId) };

        const totalReferrals = await User.countDocuments(filter);
        const referrals = await User.find(filter)
            .select('username fullName telegramId createdAt balance.usdt photoFileId')
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(limit * (page - 1))
            .lean();
        
        const referralsData = await Promise.all(referrals.map(async ref => ({
            _id: ref._id,
            username: ref.username,
            fullName: ref.fullName,
            photoUrl: await getTemporaryPhotoUrl(ref.photoFileId) || PLACEHOLDER_AVATAR_URL,
            joinDate: ref.createdAt,
            totalDeposit: ref.balance.usdt,
            level: 1
        })));
        
        res.json({ 
            totalReferrals, 
            referrals: referralsData,
            page,
            pages: Math.ceil(totalReferrals / limit)
        });

    } catch (error) {
        console.error("Error en getUserReferrals:", error);
        res.status(500).json({ message: "Error del servidor al obtener los referidos." });
    }
};

const getAdminTestData = async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    res.json({
      message: `Hola, admin ${req.user.username}! Has accedido a una ruta protegida.`,
      serverTime: new Date().toISOString(),
      totalUsersInDB: userCount,
    });
  } catch(error) {
      console.error("Error en getAdminTestData:", error);
      res.status(500).json({ message: "Error del servidor al obtener datos de prueba." });
  }
};

// =================================================================
// FUNCIÓN #1: OBTENER TODOS LOS USUARIOS (Página de "Usuarios")
// =================================================================
const getAllUsers = asyncHandler(async (req, res) => {
    const pageSize = parseInt(req.query.limit) || 10;
    const page = parseInt(req.query.page) || 1;
    const searchQuery = req.query.search;

    const filter = {};
    if (searchQuery) {
        const searchRegex = new RegExp(searchQuery, 'i');
        filter.$or = [{ username: searchRegex }, { telegramId: searchRegex }];
    }

    const count = await User.countDocuments(filter);
    const users = await User.find(filter)
        .select('username telegramId role status createdAt balance.usdt photoFileId')
        .sort({ createdAt: -1 })
        .limit(pageSize)
        .skip(pageSize * (page - 1))
        .lean(); // .lean() es crucial para el rendimiento

    // Enriquecer con la foto de forma eficiente
    const usersWithPhotoUrl = await Promise.all(
        users.map(async (user) => ({
            ...user,
            photoUrl: await getTemporaryPhotoUrl(user.photoFileId) || PLACEHOLDER_AVATAR_URL
        }))
    );
    
    res.json({ users: usersWithPhotoUrl, page, pages: Math.ceil(count / pageSize), totalUsers: count });
});

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
      const usersFound = await User.find({ 
          $or: [{ username: { $regex: search, $options: 'i' } }, { telegramId: { $regex: search, $options: 'i' } }] 
      }).select('_id').lean();
      filter.user = { $in: usersFound.map(user => user._id) };
    }
    const count = await Transaction.countDocuments(filter);
    const transactions = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .populate('user', 'username telegramId')
      .limit(pageSize)
      .skip(pageSize * (page - 1))
      .lean();
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
    if (type === 'admin_credit') {
      user.balance[currencyKey] += amount;
    } else {
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
  } finally {
    session.endSession();
  }
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
    tool.name = name;
    tool.vipLevel = vipLevel;
    tool.price = price;
    tool.miningBoost = miningBoost;
    tool.durationDays = durationDays;
    tool.imageUrl = imageUrl;
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

// =================================================================
// FUNCIÓN #2: OBTENER DETALLES DE UN USUARIO (Página de "Detalles")
// =================================================================
const getUserDetails = asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        res.status(400);
        throw new Error('ID de usuario no válido.');
    }

    const userId = new mongoose.Types.ObjectId(req.params.id);

    // Ejecutar todas las consultas en paralelo para máxima eficiencia
    const [user, transactions, referrals, transactionCount] = await Promise.all([
        User.findById(userId).select('-password').lean(),
        Transaction.find({ user: userId }).sort({ createdAt: -1 }).limit(10).lean(),
        User.find({ referredBy: userId }).select('username telegramId photoFileId createdAt').lean(),
        Transaction.countDocuments({ user: userId })
    ]);

    if (!user) {
        res.status(404);
        throw new Error('Usuario no encontrado.');
    }
    
    // Enriquecer todos los datos con fotos en un solo bloque
    const [userPhotoUrl, referralsWithPhoto] = await Promise.all([
        getTemporaryPhotoUrl(user.photoFileId),
        Promise.all(referrals.map(async (ref) => ({
            ...ref,
            photoUrl: await getTemporaryPhotoUrl(ref.photoFileId) || PLACEHOLDER_AVATAR_URL
        })))
    ]);

    res.json({
        user: { ...user, photoUrl: userPhotoUrl || PLACEHOLDER_AVATAR_URL },
        transactions: {
            items: transactions,
            total: transactionCount,
            pages: Math.ceil(transactionCount / 10)
        },
        referrals: referralsWithPhoto
    });
});

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
  } catch (error) {
    console.error("Error en generateTwoFactorSecret:", error);
    res.status(500).json({ message: 'Error al generar el secreto 2FA.' });
  }
};

const verifyAndEnableTwoFactor = async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ message: 'El token de verificación es requerido.' });
  try {
    const user = await User.findById(req.user.id).select('+twoFactorSecret');
    if (!user || !user.twoFactorSecret) return res.status(400).json({ message: 'No se ha generado un secreto 2FA para este usuario.' });
    const verified = speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: 'base32', token });
    if (verified) {
      user.isTwoFactorEnabled = true;
      await user.save();
      res.json({ message: '¡2FA habilitado exitosamente!' });
    } else {
      res.status(400).json({ message: 'Token de verificación inválido.' });
    }
  } catch (error) {
    console.error("Error en verifyAndEnableTwoFactor:", error);
    res.status(500).json({ message: 'Error al verificar el token 2FA.' });
  }
};
// =================================================================
// FUNCIÓN #5: TESORERÍA Y BARRIDO (Página de "Control de Barrido")
// =================================================================
const getTreasuryAndSweepData = asyncHandler(async (req, res) => {
    // TODO: Implementar la lógica para obtener saldos totales y wallets con fondos.
    // Esta será una de nuestras próximas tareas.
    res.status(200).json({ 
        message: "Funcionalidad de Tesorería/Barrido pendiente de implementación.",
        totals: { USDT: 0, TRX: 0, NTX: 0 },
        walletsWithBalance: []
    });
});
module.exports = {
  getAdminTestData, getAllUsers, updateUser, setUserStatus, getDashboardStats,
  getAllTransactions, createManualTransaction, getAllTools, createTool, updateTool, deleteTool,
  getUserDetails, getSettings, updateSettings, generateTwoFactorSecret, verifyAndEnableTwoFactor,
  getPendingWithdrawals, processWithdrawal,getTreasuryAndSweepData
};