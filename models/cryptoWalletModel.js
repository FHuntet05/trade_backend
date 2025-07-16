// backend/models/cryptoWalletModel.js (VERSIÓN v18.0 - CON CAMPO DE BALANCES)
const mongoose = require('mongoose');

// Sub-esquema para almacenar múltiples balances si es necesario (ej. BNB y USDT)
const balanceSchema = new mongoose.Schema({
    currency: { type: String, required: true },
    amount: { type: String, required: true }
}, { _id: false });

const cryptoWalletSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  chain: {
    type: String,
    required: true,
    enum: ['BSC', 'TRON'],
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
  lastScannedBlock: {
    type: Number,
    default: 0,
  },
  // --- CAMPO AÑADIDO ---
  // Almacena el último saldo detectado en la blockchain por el escáner.
  balances: [balanceSchema]
}, { timestamps: true });

cryptoWalletSchema.index({ user: 1, chain: 1 }, { unique: true });

const CryptoWallet = mongoose.model('CryptoWallet', cryptoWalletSchema);

module.exports = CryptoWallet;