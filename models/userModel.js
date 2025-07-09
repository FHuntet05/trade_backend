// backend/models/userModel.js (CON TASA BASE CORREGIDA)
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  language: { type: String, default: 'es' },
  photoUrl: { type: String, default: null },
  balance: {
    ntx: { type: Number, default: 0 },
    usdt: { type: Number, default: 0 }
  },
  // --- CAMBIO: Se actualiza la tasa base a 500 ---
  baseMiningRate: { type: Number, default: 500.00 },
  
  // --- CAMBIO: El valor por defecto de la tasa efectiva también se actualiza ---
  effectiveMiningRate: { type: Number, default: 500.00 },

  claimedTasks: {
    boughtUpgrade: { type: Boolean, default: false },
    invitedTenFriends: { type: Boolean, default: false },
    joinedTelegram: { type: Boolean, default: false }
  },
  activeTools: [{
    tool: { type: mongoose.Schema.Types.ObjectId, ref: 'Tool', required: true },
    purchaseDate: { type: Date, default: Date.now },
    expiryDate: { type: Date, required: true }
  }],
  miningStatus: {
    type: String,
    enum: ['IDLE', 'MINING', 'CLAIMABLE'],
    default: 'IDLE'
  },
  lastMiningClaim: { type: Date, default: Date.now },
  referralCode: {
    type: String,
    unique: true,
    default: null
  },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  referrals: [{
    level: { type: Number, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  }],
}, {
  timestamps: true,
});

userSchema.pre('save', async function (next) {
  if (this.isNew && !this.referralCode) {
    this.referralCode = `ref_${this.telegramId}_${Math.random().toString(36).substr(2, 5)}`;
  }

  if (this.isModified('activeTools')) {
    await this.populate({
      path: 'activeTools.tool',
      model: 'Tool'
    });
    
    const now = new Date();
    const activeToolBoosts = this.activeTools
      .filter(t => t.expiryDate > now && t.tool && typeof t.tool.miningBoost === 'number')
      .reduce((totalBoost, toolPurchase) => totalBoost + toolPurchase.tool.miningBoost, 0);
    
    this.effectiveMiningRate = this.baseMiningRate + activeToolBoosts;
    console.log(`Hook pre-save: effectiveMiningRate recalculado para ${this.username} a ${this.effectiveMiningRate}`);
  }
  
  next();
});

module.exports = mongoose.model('User', userSchema);