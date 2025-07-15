// backend/models/userModel.js (ACTUALIZADO CON fullName)

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  fullName: { type: String }, // <-- NUEVO CAMPO PARA NOMBRE REAL

  // --- El resto de los campos no cambian ---
  password: { type: String, required: false, select: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  status: { type: String, enum: ['active', 'banned'], default: 'active' },
  twoFactorSecret: { type: String, select: false },
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

// Los hooks y métodos no necesitan cambios
userSchema.pre('save', async function (next) { /* ... sin cambios ... */ });
userSchema.methods.matchPassword = async function(enteredPassword) { /* ... sin cambios ... */ };

module.exports = mongoose.model('User', userSchema);