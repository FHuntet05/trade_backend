// backend/models/priceModel.js
const mongoose = require('mongoose');

const priceSchema = new mongoose.Schema({
  // Usamos el ticker como un ID único para evitar duplicados.
  ticker: {
    type: String,
    required: true,
    unique: true, // 'BNB', 'TRX', 'USDT'
    uppercase: true,
  },
  // El precio en USD.
  priceUsd: {
    type: Number,
    required: true,
  },
}, {
  // Guardamos timestamps para saber cuándo fue la última actualización.
  timestamps: true,
});

module.exports = mongoose.model('Price', priceSchema);