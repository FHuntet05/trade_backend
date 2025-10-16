// RUTA: backend/controllers/investmentController.js

const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const InvestmentItem = require('../models/investmentItemModel');
const Transaction = require('../models/transactionModel');
const mongoose = require('mongoose');

const investmentController = {
  /**
   * @desc    Obtiene todos los items de mercado activos que los usuarios pueden comprar.
   * @route   GET /api/investments/items
   * @access  Private
   */
  getAvailableMarketItems: asyncHandler(async (req, res) => {
    const marketItems = await InvestmentItem.find({ isActive: true }).sort({ displayOrder: 'asc' });
    
    if (!marketItems) {
      return res.status(404).json({
        success: false,
        message: 'No hay items de mercado configurados.'
      });
    }

    res.json({
      success: true,
      data: marketItems
    });
  }),

  /**
   * @desc    Procesa la compra de un item de mercado por parte de un usuario.
   * @route   POST /api/investments/purchase
   * @access  Private
   */
  createMarketPurchase: asyncHandler(async (req, res) => {
    const { itemId, amount } = req.body;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      res.status(400);
      throw new Error('El ID del item de mercado no es válido.');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const itemConfig = await InvestmentItem.findById(itemId).session(session);
      if (!itemConfig || !itemConfig.isActive) {
        throw new Error('Este item de mercado no está disponible.');
      }

      const purchaseAmount = Number(amount);
      if (isNaN(purchaseAmount) || purchaseAmount <= 0) {
        throw new Error('El monto de la compra debe ser un número positivo.');
      }
      
      if (purchaseAmount < itemConfig.minInvestment || purchaseAmount > itemConfig.maxInvestment) {
        throw new Error(`El monto debe estar entre ${itemConfig.minInvestment} y ${itemConfig.maxInvestment} USDT.`);
      }

      const user = await User.findById(userId).session(session);
      if (!user) {
        throw new Error('Usuario no encontrado.');
      }

      if (user.balance.usdt < purchaseAmount) {
        throw new Error('Saldo insuficiente.');
      }

      user.balance.usdt -= purchaseAmount;

      const transaction = new Transaction({
        user: userId,
        type: 'market_purchase',
        amount: -purchaseAmount,
        currency: 'USDT',
        status: 'completed',
        description: `Compra en mercado: ${itemConfig.name}`,
        metadata: {
          itemId: itemConfig._id.toString(),
          itemName: itemConfig.name,
          symbol: itemConfig.symbol,
          dailyProfitPercentage: itemConfig.dailyProfitPercentage,
          durationDays: itemConfig.durationDays,
          purchasedAmount: purchaseAmount
        }
      });
      
      user.activeInvestments = user.activeInvestments || [];
      user.activeInvestments.push({
        transactionId: transaction._id,
        symbol: itemConfig.symbol,
        amount: purchaseAmount,
        profitPercentage: itemConfig.dailyProfitPercentage,
        startDate: new Date(),
        endDate: new Date(Date.now() + itemConfig.durationDays * 24 * 60 * 60 * 1000)
      });

      await transaction.save({ session });
      await user.save({ session });
      await session.commitTransaction();

      res.status(201).json({
        success: true,
        message: 'Compra realizada con éxito.',
        data: {
          purchase: transaction,
          newBalance: user.balance.usdt
        }
      });

    } catch (error) {
      await session.abortTransaction();
      res.status(400);
      throw new Error(error.message || 'No se pudo completar la compra.');
    } finally {
      session.endSession();
    }
  }),
};

module.exports = investmentController;