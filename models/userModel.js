// backend/models/userModel.js (COMPLETO CON CAMPOS 2FA)

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  
  // --- CAMPOS PARA ADMINISTRACIÓN ---
  password: { type: String, required: false, select: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  status: { type: String, enum: ['active', 'banned'], default: 'active' },
  
  // --- CAMPOS PARA 2FA (Two-Factor Authentication) ---
  twoFactorSecret: { type: String, select: false }, // Secreto para TOTP, no se envía por defecto
  isTwoFactorEnabled: { type: Boolean, default: false },

  language: { type: String, default: 'es' },
  photoUrl: { type: String, default: null },
  balance: { ntx: { type: Number, default: 0 }, usdt: { type: Number, default: 0 } },
  baseMiningRate: { type: Number, default: 500.00 },
  effectiveMiningRate: { type: Number, default: 500.00 },
  claimedTasks: { boughtUpgrade: { type: Boolean, default: false }, invitedTenFriends: { type: Boolean, default: false }, joinedTelegram: { type: Boolean, default: false } },
  activeTools: [{ tool: { type: mongoose.Schema.Types.ObjectId, ref: 'Tool', required: true }, purchaseDate: { type: Date, default: Date.now }, expiryDate: { type: Date, required: true } }],
  miningStatus: { type: String, enum: ['IDLE', 'MINING', 'CLAIMABLE'], default: 'IDLE' },
  lastMiningClaim: { type: Date, default: Date.now },
  referralCode: { type: String, unique: true, default: null },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  referrals: [{ level: { type: Number, required: true }, user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true } }],
}, {
  timestamps: true,
});

// Hook de pre-guardado (sin cambios)
userSchema.pre('save', async function (next) {
  if (this.isNew && !this.referralCode) { this.referralCode = `ref_${this.telegramId}_${Math.random().toString(36).substr(2, 5)}`; }
  if (this.isModified('password')) { if (!this.password) return next(); const salt = await bcrypt.genSalt(10); this.password = await bcrypt.hash(this.password, salt); }
  if (this.isModified('activeTools')) { await this.populate({ path: 'activeTools.tool', model: 'Tool' }); const now = new Date(); const activeToolBoosts = this.activeTools.filter(t => t.expiryDate > now && t.tool && typeof t.tool.miningBoost === 'number').reduce((totalBoost, toolPurchase) => totalBoost + toolPurchase.tool.miningBoost, 0); this.effectiveMiningRate = this.baseMiningRate + activeToolBoosts; }
  next();
});

// Método para comparar contraseñas (sin cambios)
userSchema.methods.matchPassword = async function(enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);