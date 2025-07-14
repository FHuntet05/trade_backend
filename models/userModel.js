// --- START OF FILE backend/models/userModel.js ---

// backend/models/userModel.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  
  // --- CAMPOS PARA ADMINISTRACIÓN ---
  password: {
    type: String,
    required: false, // Solo los admins tendrán contraseña
    select: false // No incluir la contraseña en las consultas por defecto
  },
  role: {
    type: String,
    enum: ['user', 'admin'], // Roles permitidos
    default: 'user' // Todos los nuevos usuarios son 'user' por defecto
  },
  // --- FIN CAMPOS PARA ADMINISTRACIÓN ---

  language: { type: String, default: 'es' },
  photoUrl: { type: String, default: null },
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

// Hook de pre-guardado
userSchema.pre('save', async function (next) {
  // Generar código de referido si es nuevo
  if (this.isNew && !this.referralCode) {
    this.referralCode = `ref_${this.telegramId}_${Math.random().toString(36).substr(2, 5)}`;
  }
  
  // Cifrar contraseña si ha sido modificada
  if (this.isModified('password')) {
    // Si no hay password (usuario normal), no hacer nada.
    if (!this.password) return next();
    
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    console.log(`Hook pre-save: Contraseña cifrada para el usuario ${this.username}.`);
  }

  // Recalcular tasa de minería si las herramientas activas cambian
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

// --- AÑADIDO: Método para comparar contraseñas ---
userSchema.methods.matchPassword = async function(enteredPassword) {
  // Si este usuario no tiene password (es un usuario normal), retorna falso inmediatamente.
  if (!this.password) {
    return false;
  }
  // Compara la contraseña ingresada con la contraseña hasheada en la BD.
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);

// --- END OF FILE backend/models/userModel.js ---