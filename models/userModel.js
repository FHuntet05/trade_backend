// backend/models/userModel.js (VERSIÓN v16.5 - HOOKS UNIFICADOS)
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true, index: true },
  username: { type: String, required: true },
  fullName: { type: String },

  password: { type: String, required: false, select: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  status: { type: String, enum: ['active', 'banned'], default: 'active' },
  
  twoFactorSecret: { type: String, select: false },
  isTwoFactorEnabled: { type: Boolean, default: false },
  
  language: { type: String, default: 'es' },
  
  photoFileId: { type: String, default: null },

  balance: { 
    ntx: { type: Number, default: 0 }, 
    usdt: { type: Number, default: 0 } 
  },
  baseMiningRate: { type: Number, default: 500.00 },
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
  miningStatus: { type: String, enum: ['IDLE', 'MINING', 'CLAIMABLE'], default: 'IDLE' },
  lastMiningClaim: { type: Date, default: Date.now },
  
  referralCode: { type: String, unique: true, default: null },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  referrals: [{ 
    level: { type: Number, required: true }, 
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true } 
  }],
}, {
  timestamps: true,
});

/**
 * CORRECCIÓN v16.5: Se unificaron los dos hooks 'pre-save' en uno solo.
 * Esto evita condiciones de carrera y comportamiento impredecible al guardar un usuario.
 * Ahora la lógica de generación de código de referido y el hash de contraseña
 * se ejecutan en secuencia dentro del mismo hook asíncrono.
 */
userSchema.pre('save', async function (next) {
  // 1. Lógica de generación de código de referido
  if (this.isNew && !this.referralCode) {
      this.referralCode = `ref_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 5)}`;
  }

  // 2. Lógica de hasheo de contraseña
  if (this.isModified('password') && this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  
  next();
});

userSchema.methods.matchPassword = async function(enteredPassword) {
  if (!this.password || !enteredPassword) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);