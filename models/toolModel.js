// backend/models/toolModel.js (CÓDIGO CONFIRMADO Y VALIDADO v15.0)
const mongoose = require('mongoose');

const toolSchema = new mongoose.Schema({
  name: { type: String, required: true },
  vipLevel: { type: Number, required: true, unique: true },
  price: { type: Number, required: true }, // Precio en USDT
  miningBoost: { type: Number, required: true }, // Aumento de NTX/DÍA
  durationDays: { type: Number, required: true },
  imageUrl: { type: String, required: true }, // Este campo ya soporta URLs
});

module.exports = mongoose.model('Tool', toolSchema);