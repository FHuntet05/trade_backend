const mongoose = require('mongoose');

const marketItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  symbol: {
    type: String,
    required: true
  },
  dailyReturn: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  minInvestment: {
    type: Number,
    required: true,
    min: 0
  },
  maxInvestment: {
    type: Number,
    required: true,
    min: 0
  },
  duration: {
    type: Number, // en horas
    required: true,
    min: 1
  },
  active: {
    type: Boolean,
    default: true
  },
  image: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const wheelSpinSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reward: {
    type: {
      type: String,
      enum: ['xp', 'usdt', 'spins'],
      required: true
    },
    value: {
      type: Number,
      required: true
    }
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const xpTransactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    enum: ['earn', 'spend'],
    required: true
  },
  source: {
    type: String,
    enum: ['wheel', 'conversion', 'bonus'],
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const stockPackageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  duration: {
    type: Number, // en días
    required: true
  },
  minAmount: {
    type: Number,
    required: true
  },
  maxAmount: {
    type: Number,
    required: true
  },
  dailyReturn: {
    type: Number,
    required: true
  },
  totalReturn: {
    type: Number,
    required: true
  },
  lockPeriod: {
    type: Number, // en días
    required: true
  },
  active: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const userInvestmentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  itemType: {
    type: String,
    enum: ['market', 'stock'],
    required: true
  },
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'itemType'
  },
  amount: {
    type: Number,
    required: true
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: true
  },
  lastProfitClaim: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active'
  },
  profitClaimed: {
    type: Number,
    default: 0
  }
});

// Exportar modelos
module.exports = {
  MarketItem: mongoose.model('MarketItem', marketItemSchema),
  WheelSpin: mongoose.model('WheelSpin', wheelSpinSchema),
  XPTransaction: mongoose.model('XPTransaction', xpTransactionSchema),
  StockPackage: mongoose.model('StockPackage', stockPackageSchema),
  UserInvestment: mongoose.model('UserInvestment', userInvestmentSchema)
};