// backend/models/cryptoWalletModel.js (VERSIÓN v18.7 - CORRECCIÓN DEFINITIVA DE COLECCIÓN)
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
}, { 
  timestamps: true,
  // CORRECCIÓN DEFINITIVA: Se especifica explícitamente el nombre de la colección en la base de datos.
  // Esto elimina cualquier ambigüedad de Mongoose y resuelve el problema de la carga infinita.
  collection: 'cryptowallets' 
});

cryptoWalletSchema.index({ user: 1, chain: 1 }, { unique: true });

module.exports = mongoose.models.CryptoWallet || mongoose.model('CryptoWallet', cryptoWalletSchema);