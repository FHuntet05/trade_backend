// backend/models/userModel.js (VERSIÓN v15.0 - CAMPO DE FOTO CORREGIDO)
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // Usar bcryptjs es una buena práctica para evitar dependencias de compilación

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
  
  // --- CAMBIO ARQUITECTÓNICO CLAVE ---
  // Reemplazamos photoUrl (temporal) por photoFileId (permanente).
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

// Hasheo de contraseña antes de guardar (si se proporciona)
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
  }
  if (this.password) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

// Comparación de contraseña para el login
userSchema.methods.matchPassword = async function(enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

// Pequeña mejora: Generar código de referido si no existe al guardar un nuevo usuario
userSchema.pre('save', function(next) {
    if (this.isNew && !this.referralCode) {
        // Genera un código simple basado en el timestamp y un aleatorio.
        this.referralCode = `ref_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 5)}`;
    }
    next();
});

module.exports = mongoose.model('User', userSchema);