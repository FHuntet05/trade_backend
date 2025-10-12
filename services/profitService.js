// backend/services/profitService.js
const Setting = require('../models/settingsModel');
const Transaction = require('../models/transactionModel');
const User = require('../models/userModel');
const mongoose = require('mongoose');

class ProfitService {
  static async calculateUserProfits() {
    const settings = await Setting.findOne({ singleton: 'global_settings' });
    if (!settings) {
      throw new Error('Configuración del sistema no encontrada');
    }

    const users = await User.find({ status: 'active' });
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();

      for (const user of users) {
        const balance = user.balance.usdt || 0;
        if (balance <= 0) continue;

        // Encontrar el nivel de ganancia correspondiente
        const tier = settings.profitTiers
          .sort((a, b) => a.minBalance - b.minBalance)
          .find(tier => balance >= tier.minBalance && balance <= tier.maxBalance);

        if (!tier) continue;

        // Calcular la ganancia diaria
        const profitPercentage = tier.profitPercentage;
        const dailyProfit = (balance * profitPercentage) / 100;

        // Registrar la transacción y actualizar el saldo
        const transaction = new Transaction({
          user: user._id,
          type: 'profit',
          amount: dailyProfit,
          currency: 'USDT',
          status: 'completed',
          description: `Ganancia diaria (${profitPercentage}% sobre ${balance} USDT)`,
          metadata: {
            profitTier: tier,
            baseBalance: balance,
            percentage: profitPercentage
          }
        });

        user.balance.usdt += dailyProfit;
        
        await transaction.save({ session });
        await user.save({ session });
      }

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  static async calculateAndDistributeProfits() {
    try {
      await this.calculateUserProfits();
      return { success: true, message: 'Ganancias distribuidas exitosamente' };
    } catch (error) {
      console.error('Error al distribuir ganancias:', error);
      throw error;
    }
  }

  static async getUserProfitHistory(userId, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    
    const profits = await Transaction.find({
      user: userId,
      type: 'profit'
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

    const total = await Transaction.countDocuments({
      user: userId,
      type: 'profit'
    });

    return {
      profits,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total
      }
    };
  }

  static async getUserProjectedProfits(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    const settings = await Setting.findOne({ singleton: 'global_settings' });
    if (!settings) {
      throw new Error('Configuración del sistema no encontrada');
    }

    const balance = user.balance.usdt || 0;
    const tier = settings.profitTiers
      .sort((a, b) => a.minBalance - b.minBalance)
      .find(tier => balance >= tier.minBalance && balance <= tier.maxBalance);

    if (!tier) {
      return {
        currentBalance: balance,
        dailyProfit: 0,
        monthlyProfit: 0,
        yearlyProfit: 0,
        profitPercentage: 0
      };
    }

    const dailyProfit = (balance * tier.profitPercentage) / 100;

    return {
      currentBalance: balance,
      dailyProfit,
      monthlyProfit: dailyProfit * 30,
      yearlyProfit: dailyProfit * 365,
      profitPercentage: tier.profitPercentage
    };
  }
}

module.exports = ProfitService;