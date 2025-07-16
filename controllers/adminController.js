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

const qrCodeToDataURLPromise = require('util').promisify(QRCode.toDataURL);
const PLACEHOLDER_AVATAR_URL = `${process.env.FRONTEND_URL}/assets/images/user-avatar-placeholder.png`;

const getPendingWithdrawals = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const filter = { type: 'withdrawal', status: 'pending' };

    const totalWithdrawals = await Transaction.countDocuments(filter);
    const pendingWithdrawals = await Transaction.find(filter)
      .populate('user', 'username telegramId')
      .sort({ createdAt: 'desc' })
      .limit(limit)
      .skip(limit * (page - 1))
      .lean();
      
    // Enriquecer con la foto
    const withdrawalsWithPhoto = await Promise.all(
        pendingWithdrawals.map(async (withdrawal) => {
            const user = await User.findById(withdrawal.user._id).select('photoFileId').lean();
            const photoUrl = await getTemporaryPhotoUrl(user?.photoFileId);
            return {
                ...withdrawal,
                user: {
                    ...withdrawal.user,
                    photoUrl: photoUrl || PLACEHOLDER_AVATAR_URL
                }
            };
        })
    );

    res.json({
      withdrawals: withdrawalsWithPhoto,
      page,
      pages: Math.ceil(totalWithdrawals / limit),
      total: totalWithdrawals
    });
  } catch (error) {
    console.error("Error en getPendingWithdrawals:", error);
    res.status(500).json({ message: "Error del servidor al obtener retiros pendientes." });
  }
};

const processWithdrawal = async (req, res) => {
  const { status, adminNotes } = req.body;
  const { id } = req.params;

  if (!['completed', 'rejected'].includes(status)) {
    return res.status(400).json({ message: "El estado debe ser 'completed' o 'rejected'." });
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    
    const withdrawal = await Transaction.findById(id).session(session);
    if (!withdrawal || withdrawal.type !== 'withdrawal' || withdrawal.status !== 'pending') {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Retiro no encontrado o ya ha sido procesado.' });
    }
    
    withdrawal.status = status;
    withdrawal.metadata.set('adminNotes', adminNotes || 'N/A');
    withdrawal.metadata.set('processedBy', req.user.username);

    if (status === 'completed') {
      const recipientAddress = withdrawal.metadata.get('walletAddress');
      const amount = withdrawal.amount;
      const currency = withdrawal.metadata.get('currency');

      if (!recipientAddress || !amount || !currency) {
        throw new Error('Datos de retiro incompletos (dirección, monto o moneda faltante) en la transacción.');
      }
      
      let txHash;
      if (currency.startsWith('USDT')) {
        txHash = await transactionService.sendUsdtOnTron(recipientAddress, amount);
      } else {
        throw new Error(`La moneda de retiro '${currency}' no está soportada para envíos automáticos.`);
      }

      if (!txHash) {
        throw new Error('La transacción fue enviada pero no se recibió un hash.');
      }

      withdrawal.metadata.set('transactionHash', txHash);
      withdrawal.description = `Retiro completado. Hash: ${txHash.substring(0,15)}...`;

    } else {
      const user = await User.findById(withdrawal.user).session(session);
      if (!user) throw new Error('Usuario del retiro no encontrado.');
      
      const currencyKey = withdrawal.metadata.get('currency').split('_')[0].toLowerCase();
      user.balance[currencyKey] += withdrawal.amount;
      
      await user.save({ session });
      withdrawal.description = `Retiro rechazado. Fondos devueltos al saldo del usuario.`;
    }

    const updatedWithdrawal = await withdrawal.save({ session });
    await session.commitTransaction();
    
    res.json({ message: `Retiro ${status} exitosamente.`, withdrawal: updatedWithdrawal });

  } catch (error) {
    await session.abortTransaction();
    console.error("Error en processWithdrawal:", error);
    res.status(500).json({ message: error.message || "Error del servidor al procesar el retiro." });
  } finally {
    session.endSession();
  }
};

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

const getAllUsers = async (req, res) => {
  try {
    const pageSize = 10;
    const page = Number(req.query.page) || 1;
    const searchQuery = req.query.search;
    const filter = {};
    if (searchQuery) {
      const searchRegex = new RegExp(searchQuery, 'i');
      filter.$or = [{ username: searchRegex }, { telegramId: searchRegex }];
    }
    const count = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select('username telegramId role status createdAt balance photoFileId')
      .sort({ createdAt: -1 })
      .limit(pageSize)
      .skip(pageSize * (page - 1))
      .lean();

    const usersWithPhotoUrl = await Promise.all(
        users.map(async (user) => {
            const photoUrl = await getTemporaryPhotoUrl(user.photoFileId);
            return {
                ...user,
                photoUrl: photoUrl || PLACEHOLDER_AVATAR_URL
            };
        })
    );
    
    res.json({ users: usersWithPhotoUrl, page, pages: Math.ceil(count / pageSize), totalUsers: count });
  } catch (error) {
    console.error("Error en getAllUsers:", error);
    res.status(500).json({ message: 'Error del servidor al obtener la lista de usuarios.' });
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

const getUserDetails = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'ID de usuario no válido.' });
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
    const page = Number(req.query.page) || 1;
    const pageSize = 10;
    const transactionsCount = await Transaction.countDocuments({ user: user._id });
    const transactions = await Transaction.find({ user: user._id }).sort({ createdAt: -1 }).limit(pageSize).skip(pageSize * (page - 1)).lean();
    res.json({ user, transactions: { items: transactions, page, pages: Math.ceil(transactionsCount / pageSize) } });
  } catch (error) {
    console.error("Error en getUserDetails:", error);
    res.status(500).json({ message: 'Error del servidor.' });
  }
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

module.exports = {
  getAdminTestData, getAllUsers, updateUser, setUserStatus, getDashboardStats,
  getAllTransactions, createManualTransaction, getAllTools, createTool, updateTool, deleteTool,
  getUserDetails, getSettings, updateSettings, generateTwoFactorSecret, verifyAndEnableTwoFactor,
  getPendingWithdrawals, processWithdrawal, getUserReferrals
};