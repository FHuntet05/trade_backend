// backend/models/userModel.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  language: { type: String, default: 'es' },
  balance: {
    ntx: { type: Number, default: 0 },
    usdt: { type: Number, default: 0 }
  },
  // Tasa de minería base que tiene el usuario por defecto
  baseMiningRate: { type: Number, default: 50.00 }, // <-- MODIFICADO: Recompensa inicial de 50 NTX/h

  // --- AÑADIMOS EL REGISTRO DE TAREAS ---
  claimedTasks: {
    boughtUpgrade: { type: Boolean, default: false },
    invitedTenFriends: { type: Boolean, default: false },
    joinedTelegram: { type: Boolean, default: false }
  },
  
  // Array para registrar las herramientas que el usuario ha comprado
  activeTools: [{
    tool: { type: mongoose.Schema.Types.ObjectId, ref: 'Tool', required: true },
    purchaseDate: { type: Date, default: Date.now },
    expiryDate: { type: Date, required: true }
  }],
  
  lastMiningClaim: { type: Date, default: Date.now }, // Registra la última vez que el usuario reclamó sus NTX
  
  referralCode: { 
  type: String,
  unique: true, // Lo dejamos único, pero ya no es requerido al crear el objeto
  default: null   // Es buena práctica añadir un default
},
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // Eliminamos referralLevel, ya que podemos determinarlo dinámicamente
  
}, { 
  timestamps: true,
  toJSON: { virtuals: true }, // Asegúrate de incluir los campos virtuales cuando se convierte a JSON
  toObject: { virtuals: true }
});

// CAMPO VIRTUAL: Calcula la tasa de minería total en tiempo real
userSchema.virtual('effectiveMiningRate').get(function() {
  const now = new Date();
  // Filtramos solo las herramientas que no han expirado
  const activeToolBoosts = this.activeTools
    .filter(t => t.expiryDate > now)
    .reduce((totalBoost, toolPurchase) => {
      // Necesitamos popular 'tool' para acceder a 'miningBoost'
      // Esto se hará en el controlador antes de usar este campo.
      if (toolPurchase.tool && toolPurchase.tool.miningBoost) {
        return totalBoost + toolPurchase.tool.miningBoost;
      }
      return totalBoost;
    }, 0);
  
  return this.baseMiningRate + activeToolBoosts;
});

userSchema.pre('save', function (next) {
  // this.isNew se asegura de que esto solo se ejecute al crear un nuevo usuario
  if (this.isNew && !this.referralCode) {
    // Generamos un código único basado en el ID de Telegram y un string aleatorio
    this.referralCode = `ref_${this.telegramId}_${Math.random().toString(36).substr(2, 5)}`;
  }
  next(); // Continuamos con el proceso de guardado
});

module.exports = mongoose.model('User', userSchema);