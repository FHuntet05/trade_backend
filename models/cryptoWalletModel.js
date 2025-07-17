// backend/models/cryptoWalletModel.js (VERSIÓN v18.5 - BLINDADO CONTRA CRASHES)
const mongoose = require('mongoose');

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
  balances: [balanceSchema]
}, { timestamps: true });

cryptoWalletSchema.index({ user: 1, chain: 1 }, { unique: true });

// CORRECCIÓN CRÍTICA: Previene el error 'OverwriteModelError' con nodemon.
// Esto asegura que el servidor no se caiga en reinicios, solucionando el problema del loader infinito.
module.exports = mongoose.models.CryptoWallet || mongoose.model('CryptoWallet', cryptoWalletSchema);