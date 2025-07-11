// backend/models/toolModel.js
const mongoose = require('mongoose');

const toolSchema = new mongoose.Schema({
  name: { type: String, required: true },
  vipLevel: { type: Number, required: true, unique: true },
  price: { type: Number, required: true }, // Precio en USDT
  // --- NOTA DE MENTORÍA: Este campo ahora representa la ganancia DIARIA para alinearse con la lógica de negocio. ---
  miningBoost: { type: Number, required: true }, // Aumento de NTX/DÍA
  durationDays: { type: Number, required: true },
  imageUrl: { type: String, required: true },
});

module.exports = mongoose.model('Tool', toolSchema);