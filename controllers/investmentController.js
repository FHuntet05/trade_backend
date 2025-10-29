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
    const { itemId } = req.body; // El monto ahora es fijo del item, no del body.
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
      
      const purchaseAmount = itemConfig.price; // El precio se toma directamente del item.

      const user = await User.findById(userId).session(session);
      if (!user) { throw new Error('Usuario no encontrado.'); }
      if (user.balance.usdt < purchaseAmount) { throw new Error('Saldo insuficiente.'); }

      user.balance.usdt -= purchaseAmount;

      // --- INICIO DE LA MODIFICACIÓN ---
      // Se incrementa el contador de compras del item.
      itemConfig.purchaseCount += 1;
      // --- FIN DE LA MODIFICACIÓN ---

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
          dailyProfitAmount: itemConfig.dailyProfitAmount,
          durationDays: itemConfig.durationDays,
          purchasedAmount: purchaseAmount
        }
      });
      
      user.activeInvestments = user.activeInvestments || [];
      user.activeInvestments.push({
        transactionId: transaction._id,
        symbol: itemConfig.linkedCryptoSymbol, // Usamos el nuevo campo
        amount: purchaseAmount,
        profitPercentage: 0, // El profit se define por 'dailyProfitAmount', este campo puede quedar obsoleto o usarse para otra cosa
        startDate: new Date(),
        endDate: new Date(Date.now() + itemConfig.durationDays * 24 * 60 * 60 * 1000)
      });

      await transaction.save({ session });
      await itemConfig.save({ session }); // Guardamos el item actualizado
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
  
  // --- NUEVA FUNCIÓN ---
  /**
   * @desc    Obtiene una lista simple de símbolos de criptos para los formularios del admin.
   * @route   GET /api/investments/available-cryptos
   * @access  Private (Admin)
   */
  getAvailableCryptos: asyncHandler(async (req, res) => {
    // En un futuro, esto podría venir de una tabla de configuración.
    // Por ahora, es una lista fija y robusta.
    const cryptos = [
      { symbol: 'BTC', name: 'Bitcoin' },
      { symbol: 'ETH', name: 'Ethereum' },
      { symbol: 'BNB', name: 'BNB' },
      { symbol: 'SOL', name: 'Solana' },
      { symbol: 'USDT', name: 'Tether' },
    ];
    res.json({ success: true, data: cryptos });
  }),
};

module.exports = investmentController;