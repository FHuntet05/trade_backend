// backend/models/cryptoWalletModel.js
const mongoose = require('mongoose');

const cryptoWalletSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  chain: {
    type: String,
    required: true,
    enum: ['BSC', 'TRON'], // Cadenas soportadas
  },
  address: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  derivationIndex: {
    type: Number,
    required: true,
  },
}, { timestamps: true });

// Índice compuesto para asegurar que un usuario solo tenga una wallet por cadena
cryptoWalletSchema.index({ user: 1, chain: 1 }, { unique: true });

const CryptoWallet = mongoose.model('CryptoWallet', cryptoWalletSchema);

module.exports = CryptoWallet;