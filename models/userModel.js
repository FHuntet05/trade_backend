// backend/models/userModel.js (VERSIÓN COMPLETA Y CORREGIDA)
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  language: { type: String, default: 'es' },
  photoUrl: { type: String, default: null }, // Añadido para consistencia
  balance: {
    ntx: { type: Number, default: 0 },
    usdt: { type: Number, default: 0 }
  },
  baseMiningRate: { type: Number, default: 50.00 },
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
  lastMiningClaim: { type: Date, default: Date.now },
  referralCode: {
    type: String,
    unique: true,
    default: null
  },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  
  // --- CORRECCIÓN: CAMPO 'referrals' AÑADIDO ---
  // Almacena una lista de los usuarios que este usuario ha referido.
  // Es crucial para la lógica de comisiones y para la tarea "Invitar 10 Amigos".
  referrals: [{
    level: { type: Number, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  }],
  // --- FIN DE LA CORRECCIÓN ---

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

userSchema.virtual('effectiveMiningRate').get(function() {
  const now = new Date();
  const activeToolBoosts = this.activeTools
    .filter(t => t.expiryDate > now && t.tool && t.tool.miningBoost)
    .reduce((totalBoost, toolPurchase) => totalBoost + toolPurchase.tool.miningBoost, 0);
  
  return this.baseMiningRate + activeToolBoosts;
});

userSchema.pre('save', function (next) {
  if (this.isNew && !this.referralCode) {
    this.referralCode = `ref_${this.telegramId}_${Math.random().toString(36).substr(2, 5)}`;
  }
  next();
});

module.exports = mongoose.model('User', userSchema);