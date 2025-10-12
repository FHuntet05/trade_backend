const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const Setting = require('../models/settingsModel');
const Transaction = require('../models/transactionModel');
const mongoose = require('mongoose');

const investmentController = {
  // Obtener las criptomonedas disponibles para inversión
  getAvailableCryptos: asyncHandler(async (req, res) => {
    const settings = await Setting.findOne({ singleton: 'global_settings' });
    if (!settings || !settings.cryptoSettings) {
      return res.status(404).json({
        success: false,
        message: 'No hay criptomonedas configuradas'
      });
    }

    // Filtrar solo las criptos activas y ordenar por orden de visualización
    const availableCryptos = settings.cryptoSettings
      .filter(crypto => crypto.isActive)
      .sort((a, b) => a.displayOrder - b.displayOrder);

    res.json({
      success: true,
      data: availableCryptos
    });
  }),

  // Crear una nueva inversión
  createInvestment: asyncHandler(async (req, res) => {
    const { symbol, amount } = req.body;
    const userId = req.user._id;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Obtener configuración de la criptomoneda
      const settings = await Setting.findOne({ singleton: 'global_settings' });
      const cryptoConfig = settings.cryptoSettings.find(c => c.symbol === symbol);

      if (!cryptoConfig || !cryptoConfig.isActive) {
        throw new Error('Criptomoneda no disponible para inversión');
      }

      // Validar monto mínimo y máximo
      if (amount < cryptoConfig.minInvestment || amount > cryptoConfig.maxInvestment) {
        throw new Error(`El monto debe estar entre ${cryptoConfig.minInvestment} y ${cryptoConfig.maxInvestment} USDT`);
      }

      // Obtener usuario y verificar saldo
      const user = await User.findById(userId).session(session);
      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      if (user.balance.usdt < amount) {
        throw new Error('Saldo insuficiente');
      }

      // Calcular ganancia diaria aleatoria dentro del rango configurado
      const profitPercentage = cryptoConfig.profitRange.min + 
        Math.random() * (cryptoConfig.profitRange.max - cryptoConfig.profitRange.min);

      // Crear transacción de inversión
      const transaction = new Transaction({
        user: userId,
        type: 'investment',
        amount: -amount, // Negativo porque sale del balance
        currency: 'USDT',
        status: 'completed',
        description: `Inversión en ${symbol}`,
        metadata: {
          symbol,
          profitPercentage,
          investmentPeriod: '24h',
          initialAmount: amount
        }
      });

      // Actualizar balance del usuario
      user.balance.usdt -= amount;
      
      // Agregar la inversión activa al usuario
      user.activeInvestments = user.activeInvestments || [];
      user.activeInvestments.push({
        transactionId: transaction._id,
        symbol,
        amount,
        profitPercentage,
        startDate: new Date(),
        endDate: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 horas
      });

      // Guardar cambios
      await transaction.save({ session });
      await user.save({ session });
      await session.commitTransaction();

      res.json({
        success: true,
        data: {
          investment: transaction,
          newBalance: user.balance.usdt
        }
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }),

  // Obtener inversiones activas del usuario
  getActiveInvestments: asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const user = await User.findById(userId)
      .populate({
        path: 'activeInvestments.transactionId',
        model: 'Transaction'
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    const activeInvestments = user.activeInvestments || [];

    res.json({
      success: true,
      data: activeInvestments
    });
  }),

  // Obtener historial de inversiones
  getInvestmentHistory: asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const investments = await Transaction.find({
      user: userId,
      type: 'investment'
    })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

    const total = await Transaction.countDocuments({
      user: userId,
      type: 'investment'
    });

    res.json({
      success: true,
      data: {
        investments,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          total
        }
      }
    });
  }),

  // Obtener estadísticas de inversión
  getInvestmentStats: asyncHandler(async (req, res) => {
    const userId = req.user._id;

    const stats = await Transaction.aggregate([
      {
        $match: {
          user: mongoose.Types.ObjectId(userId),
          type: 'investment'
        }
      },
      {
        $group: {
          _id: '$metadata.symbol',
          totalInvested: { $sum: { $abs: '$amount' } },
          totalProfits: {
            $sum: {
              $cond: [
                { $eq: ['$type', 'investment_profit'] },
                '$amount',
                0
              ]
            }
          },
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: stats
    });
  })
};

module.exports = investmentController;