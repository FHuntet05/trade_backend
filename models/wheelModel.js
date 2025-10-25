// RUTA: backend/models/wheelModel.js

const mongoose = require('mongoose');

const wheelSegmentSchema = new mongoose.Schema({
  // Se mantiene un ID único para cada segmento para poder referenciarlo
  segmentId: { type: mongoose.Schema.Types.ObjectId, auto: true },
  
  // --- LÓGICA DE NEGOCIO: CONFIGURACIÓN DINÁMICA ---
  // El admin debe poder configurar cada aspecto visual y funcional del premio.
  type: {
    type: String,
    enum: ['usdt', 'xp', 'spins', 'item'], // 'item' podría ser para un NFT o un plan cuantitativo
    required: true
  },
  value: {
    type: Number,
    required: true
  },
  text: { // Texto que se muestra en la ruleta (ej: "10 USDT", "+1 Giro")
    type: String,
    required: true
  },
  imageUrl: { // URL de la imagen que se muestra en el segmento
    type: String,
    default: ''
  },
  
  // --- LÓGICA DE NEGOCIO: MOTOR DE PROBABILIDADES ---
  // Se reemplaza 'probability' por 'weight' para el sistema ponderado.
  // Un peso más alto significa que es más probable que salga.
  weight: {
    type: Number,
    required: true,
    min: 0,
    default: 1
  },
  isRare: { // Marca un premio como "raro" para el sistema de piedad
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  }
});


const wheelConfigSchema = new mongoose.Schema({
  singleton: { type: String, default: 'global_wheel_config', unique: true },
  
  // --- LÓGICA DE NEGOCIO: CONFIGURACIÓN GENERAL ---
  xpToUsdtConversionRate: { // Tasa de conversión de XP a USDT
    type: Number,
    default: 0.0001 // Ej: 1 XP = 0.0001 USDT
  },
  
  // --- LÓGICA DE NEGOCIO: SISTEMA DE PIEDAD (PITY SYSTEM) ---
  pitySystemThreshold: { // Umbral de giros para garantizar un premio raro
    type: Number,
    default: 100,
    min: 1
  },
  pitySystemGuaranteedPrizeSegmentId: { // El _id del segmento garantizado
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WheelConfig.segments', // Referencia a un segmento dentro de este mismo documento
    default: null
  },
  
  // Los 8 segmentos de la ruleta
  segments: {
    type: [wheelSegmentSchema],
    validate: [
      {
        validator: function(val) { return val.length === 8; },
        message: 'La ruleta debe tener exactamente 8 segmentos.'
      }
    ]
  }
}, {
  timestamps: true
});

// Middleware para asegurar que el ID del premio de piedad sea válido
wheelConfigSchema.pre('save', function(next) {
    if (this.pitySystemGuaranteedPrizeSegmentId) {
        const segmentExists = this.segments.some(s => s._id.equals(this.pitySystemGuaranteedPrizeSegmentId));
        if (!segmentExists) {
            return next(new Error('El ID del premio garantizado por el sistema de piedad no corresponde a ningún segmento existente.'));
        }
    }
    next();
});

const WheelConfig = mongoose.model('WheelConfig', wheelConfigSchema);

module.exports = WheelConfig;