const express = require('express');
const router = express.Router();
const { MarketItem, StockPackage, UserInvestment } = require('../models/newFeatureModels');
const { User } = require('../models/userModel');
const auth = require('../middleware/authMiddleware');
const blockchainService = require('../services/blockchainService');

// Obtener items del mercado
router.get('/market/items', auth, async (req, res) => {
  try {
    const items = await MarketItem.find({ active: true });
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Obtener paquetes de stock
router.get('/market/stock-packages', auth, async (req, res) => {
  try {
    const packages = await StockPackage.find({ active: true });
    res.json(packages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Invertir en item de mercado
router.post('/market/invest', auth, async (req, res) => {
  try {
    const { itemId, amount } = req.body;
    const user = await User.findById(req.user.id);
    const item = await MarketItem.findById(itemId);

    if (!item || !item.active) {
      return res.status(404).json({ message: 'Item not found or inactive' });
    }

    if (amount < item.minInvestment || amount > item.maxInvestment) {
      return res.status(400).json({ message: 'Invalid investment amount' });
    }

    if (user.balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    // Crear inversión
    const investment = new UserInvestment({
      user: user._id,
      itemType: 'market',
      itemId: item._id,
      amount,
      endDate: new Date(Date.now() + item.duration * 3600000) // duración en horas
    });

    // Actualizar balance
    user.balance -= amount;

    await Promise.all([
      investment.save(),
      user.save()
    ]);

    res.json({ message: 'Investment successful', investment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Invertir en paquete de stock
router.post('/market/stock', auth, async (req, res) => {
  try {
    const { packageId, amount } = req.body;
    const user = await User.findById(req.user.id);
    const stockPackage = await StockPackage.findById(packageId);

    if (!stockPackage || !stockPackage.active) {
      return res.status(404).json({ message: 'Package not found or inactive' });
    }

    if (amount < stockPackage.minAmount || amount > stockPackage.maxAmount) {
      return res.status(400).json({ message: 'Invalid investment amount' });
    }

    if (user.balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    // Crear inversión
    const investment = new UserInvestment({
      user: user._id,
      itemType: 'stock',
      itemId: stockPackage._id,
      amount,
      endDate: new Date(Date.now() + stockPackage.duration * 86400000) // duración en días
    });

    // Actualizar balance
    user.balance -= amount;

    await Promise.all([
      investment.save(),
      user.save()
    ]);

    res.json({ message: 'Stock package purchased', investment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Reclamar ganancias
router.post('/market/claim-profits', auth, async (req, res) => {
  try {
    const { investmentId } = req.body;
    const investment = await UserInvestment.findOne({
      _id: investmentId,
      user: req.user.id,
      status: 'active'
    });

    if (!investment) {
      return res.status(404).json({ message: 'Investment not found' });
    }

    const item = await (investment.itemType === 'market' 
      ? MarketItem.findById(investment.itemId)
      : StockPackage.findById(investment.itemId));

    const hoursSinceLastClaim = 
      (Date.now() - investment.lastProfitClaim) / 3600000;

    const profit = (investment.amount * (item.dailyReturn / 100) / 24) * hoursSinceLastClaim;

    // Actualizar usuario y inversión
    const user = await User.findById(req.user.id);
    user.balance += profit;
    investment.lastProfitClaim = new Date();
    investment.profitClaimed += profit;

    await Promise.all([
      user.save(),
      investment.save()
    ]);

    res.json({
      message: 'Profits claimed successfully',
      profit,
      newBalance: user.balance
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;