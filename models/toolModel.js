// RUTA: backend/models/toolModel.js (VERSIÓN "NEXUS - FREE MINER")
const mongoose = require('mongoose');

const toolSchema = new mongoose.Schema({
  name: { type: String, required: true },
  vipLevel: { type: Number, required: true, unique: true },
  price: { type: Number, required: true },
  miningBoost: { type: Number, required: true }, // Aumento de NTX/DÍA
  durationDays: { type: Number, required: true },
  imageUrl: { type: String, required: true },
  // [NEXUS FREE MINER] Se añade el campo para marcar una fábrica como gratuita.
  isFree: { type: Boolean, default: false },
});

// Índice para asegurar que solo una herramienta pueda ser gratuita.
toolSchema.index({ isFree: 1 }, { unique: true, partialFilterExpression: { isFree: true } });

module.exports = mongoose.model('Tool', toolSchema);