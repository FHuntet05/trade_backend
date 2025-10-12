const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');
const mongoose = require('mongoose');

class InvestmentService {
  static async processInvestmentProfits() {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Obtener usuarios con inversiones activas
      const users = await User.find({
        'activeInvestments': { $exists: true, $ne: [] }
      });

      for (const user of users) {
        for (const investment of user.activeInvestments) {
          // Verificar si la inversión ha terminado
          if (new Date() >= investment.endDate) {
            // Procesar el retorno de la inversión
            await this.processInvestmentReturn(user, investment, session);
          } else {
            // Procesar la ganancia diaria
            await this.processDailyProfit(user, investment, session);
          }
        }
      }

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      console.error('Error procesando ganancias de inversiones:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  static async processDailyProfit(user, investment, session) {
    const dailyProfit = (investment.amount * investment.profitPercentage) / 100;

    // Crear transacción de ganancia
    const profitTransaction = new Transaction({
      user: user._id,
      type: 'investment_profit',
      amount: dailyProfit,
      currency: 'USDT',
      status: 'completed',
      description: `Ganancia de inversión en ${investment.symbol}`,
      metadata: {
        symbol: investment.symbol,
        investmentTransactionId: investment.transactionId,
        profitPercentage: investment.profitPercentage
      }
    });

    // Actualizar balance del usuario
    user.balance.usdt += dailyProfit;

    await profitTransaction.save({ session });
    await user.save({ session });
  }

  static async processInvestmentReturn(user, investment, session) {
    // Crear transacción de retorno de inversión
    const returnTransaction = new Transaction({
      user: user._id,
      type: 'investment_return',
      amount: investment.amount,
      currency: 'USDT',
      status: 'completed',
      description: `Retorno de inversión en ${investment.symbol}`,
      metadata: {
        symbol: investment.symbol,
        investmentTransactionId: investment.transactionId,
        totalDays: Math.floor((investment.endDate - investment.startDate) / (1000 * 60 * 60 * 24))
      }
    });

    // Actualizar balance del usuario
    user.balance.usdt += investment.amount;

    // Eliminar la inversión activa
    user.activeInvestments = user.activeInvestments.filter(
      inv => inv.transactionId.toString() !== investment.transactionId.toString()
    );

    await returnTransaction.save({ session });
    await user.save({ session });
  }

  static async getInvestmentSummary(userId) {
    const user = await User.findById(userId).populate('activeInvestments.transactionId');
    
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    const summary = {
      totalInvested: 0,
      totalProfits: 0,
      activeInvestments: 0,
      projectedDailyProfits: 0
    };

    // Calcular totales de inversiones activas
    for (const investment of user.activeInvestments) {
      summary.totalInvested += investment.amount;
      summary.activeInvestments += 1;
      summary.projectedDailyProfits += (investment.amount * investment.profitPercentage) / 100;
    }

    // Obtener ganancias históricas
    const profits = await Transaction.aggregate([
      {
        $match: {
          user: user._id,
          type: 'investment_profit',
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    summary.totalProfits = profits.length > 0 ? profits[0].total : 0;

    return summary;
  }

  static scheduleInvestmentProcessing() {
    // Programar el procesamiento de ganancias cada 24 horas
    setInterval(async () => {
      try {
        await this.processInvestmentProfits();
      } catch (error) {
        console.error('Error en el procesamiento programado de inversiones:', error);
      }
    }, 24 * 60 * 60 * 1000); // 24 horas
  }
}

// Iniciar el procesamiento programado de inversiones
InvestmentService.scheduleInvestmentProcessing();

module.exports = InvestmentService;