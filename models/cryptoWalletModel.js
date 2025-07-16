// backend/models/cryptoWalletModel.js (CÓDIGO CONFIRMADO Y VALIDADO v15.0)
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
    enum: ['BSC', 'TRON'],
  },
  address: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  // --- CAMPO CRÍTICO PARA EL BARRIDO ---
  // Este índice nos permite regenerar la clave privada de esta wallet
  // usando la MASTER_SEED_PHRASE y la ruta de derivación correcta (ej. m/44'/195'/0'/0/{derivationIndex}).
  derivationIndex: {
    type: Number,
    required: true,
  },
  lastScannedBlock: {
    type: Number,
    required: true,
    default: 0,
  },
}, { timestamps: true });

cryptoWalletSchema.index({ user: 1, chain: 1 }, { unique: true });

const CryptoWallet = mongoose.model('CryptoWallet', cryptoWalletSchema);

module.exports = CryptoWallet;