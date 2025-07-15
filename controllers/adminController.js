// backend/controllers/adminController.js (COMPLETO CON TRANSACCIÓN MANUAL)

const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');
const mongoose = require('mongoose');

// --- CÓDIGOS DE RELLENO (para asegurar que el archivo esté completo) ---
const getAdminTestDataRelleno = async (req, res) => { /* ... */ }; const updateUserRelleno = async (req, res) => { /* ... */ }; const setUserStatusRelleno = async (req, res) => { /* ... */ }; const getDashboardStatsRelleno = async (req, res) => { /* ... */ }; const getAllUsersRelleno = async (req, res) => { /* ... */ }; const getAllTransactionsRelleno = async (req, res) => { /* ... */ };
const getAdminTestDataRellenoF = async (req, res) => { const userCount = await User.countDocuments(); res.json({ message: `Hola, admin ${req.user.username}!`, serverTime: new Date().toISOString(), totalUsersInDB: userCount }); };
const updateUserRellenoF = async (req, res) => { if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'ID no válido.' }); try { const user = await User.findById(req.params.id); if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' }); user.role = req.body.role ?? user.role; user.balance.usdt = req.body.balanceUsdt ?? user.balance.usdt; user.balance.ntx = req.body.balanceNtx ?? user.balance.ntx; const updatedUser = await user.save(); res.json(updatedUser); } catch (error) { res.status(500).json({ message: 'Error del servidor.' }); } };
const setUserStatusRellenoF = async (req, res) => { if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'ID no válido.' }); const { status } = req.body; if (!status || !['active', 'banned'].includes(status)) return res.status(400).json({ message: "Estado no válido." }); try { const user = await User.findById(req.params.id); if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' }); if (user._id.equals(req.user._id)) return res.status(400).json({ message: 'No puedes cambiar tu propio estado.' }); user.status = status; const updatedUser = await user.save(); res.json(updatedUser); } catch (error) { res.status(500).json({ message: 'Error del servidor.' }); } };
const getDashboardStatsRellenoF = async (req, res) => { try { const last14Days = new Date(); last14Days.setDate(last14Days.getDate() - 14); const [totalUsers, totalDepositVolume, userGrowthData] = await Promise.all([ User.countDocuments(), Transaction.aggregate([{ $match: { type: 'deposit', currency: 'USDT' } }, { $group: { _id: null, totalVolume: { $sum: '$amount' } } }]), User.aggregate([{ $match: { createdAt: { $gte: last14Days } } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]) ]); res.json({ totalUsers, totalDepositVolume: totalDepositVolume[0]?.totalVolume || 0, userGrowthData: userGrowthData.map(item => ({ date: item._id, NuevosUsuarios: item.count })) }); } catch (error) { res.status(500).json({ message: 'Error del servidor.' }); } };
const getAllUsersRellenoF = async (req, res) => { try { const pageSize = 10; const page = Number(req.query.page) || 1; const searchQuery = req.query.search; const filter = {}; if (searchQuery) { const searchRegex = new RegExp(searchQuery, 'i'); filter.$or = [{ username: searchRegex }, { telegramId: searchRegex }]; } const count = await User.countDocuments(filter); const users = await User.find(filter).sort({ createdAt: -1 }).limit(pageSize).skip(pageSize * (page - 1)); res.json({ users, page, pages: Math.ceil(count / pageSize), totalUsers: count }); } catch (error) { res.status(500).json({ message: 'Error del servidor.' }); } };
const getAllTransactionsRellenoF = async (req, res) => { try { const pageSize = 15; const page = Number(req.query.page) || 1; const { search, type } = req.query; const filter = {}; if (type) { filter.type = type; } if (search) { const searchRegex = new RegExp(search, 'i'); const usersFound = await User.find({ $or: [{ username: searchRegex }, { telegramId: searchRegex }] }).select('_id'); const userIds = usersFound.map(user => user._id); filter.user = { $in: userIds }; } const count = await Transaction.countDocuments(filter); const transactions = await Transaction.find(filter).sort({ createdAt: -1 }).populate('user', 'username photoUrl').limit(pageSize).skip(pageSize * (page - 1)); res.json({ transactions, page, pages: Math.ceil(count / pageSize), totalTransactions: count }); } catch (error) { res.status(500).json({ message: 'Error del servidor.' }); } };


/**
 * @desc    Crea una transacción manual (crédito/débito) para un usuario
 * @route   POST /api/admin/transactions/manual
 * @access  Private/Admin
 */
const createManualTransaction = async (req, res) => {
  const { userId, type, currency, amount, reason } = req.body;

  // Validación de datos de entrada
  if (!userId || !type || !currency || !amount || !reason) {
    return res.status(400).json({ message: 'Faltan campos requeridos (userId, type, currency, amount, reason).' });
  }
  if (!['admin_credit', 'admin_debit'].includes(type)) {
    return res.status(400).json({ message: 'El tipo de transacción debe ser "admin_credit" o "admin_debit".' });
  }
  if (amount <= 0) {
    return res.status(400).json({ message: 'El monto debe ser un número positivo.' });
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new Error('Usuario no encontrado.');
    }

    const balanceField = currency.toLowerCase() === 'usdt' ? 'balance.usdt' : 'balance.ntx';
    const originalBalance = user.balance[currency.toLowerCase()];

    // Aplicar el cambio de saldo
    if (type === 'admin_credit') {
      user[balanceField] += amount;
    } else { // admin_debit
      if (originalBalance < amount) {
        throw new Error('Saldo insuficiente para realizar el débito.');
      }
      user[balanceField] -= amount;
    }

    await user.save({ session });

    // Crear el registro de la transacción para auditoría
    const transaction = new Transaction({
      user: userId,
      type: type,
      currency: currency,
      amount: amount,
      description: reason,
      metadata: {
        adminId: req.user._id.toString(),
        adminUsername: req.user.username,
        originalBalance: originalBalance.toString(),
      }
    });

    await transaction.save({ session });
    
    await session.commitTransaction();
    res.status(201).json({ message: 'Transacción manual creada y saldo actualizado exitosamente.', user: user.toObject() });

  } catch (error) {
    await session.abortTransaction();
    console.error('Error al crear transacción manual:', error);
    res.status(500).json({ message: error.message || 'Error del servidor al procesar la transacción.' });
  } finally {
    session.endSession();
  }
};


module.exports = {
  getAdminTestData: getAdminTestDataRellenoF,
  getAllUsers: getAllUsersRellenoF,
  updateUser: updateUserRellenoF,
  setUserStatus: setUserStatusRellenoF,
  getDashboardStats: getDashboardStatsRellenoF,
  getAllTransactions: getAllTransactionsRellenoF,
  createManualTransaction, // Exportamos la nueva función
};