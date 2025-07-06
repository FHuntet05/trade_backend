// backend/models/transactionModel.js

const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    required: true,
    enum: [
      'deposit',          // Depósito vía CryptoCloud
      'withdrawal',       // Solicitud de retiro
      'purchase',         // Compra de herramienta (con saldo o cripto)
      'swap_ntx_to_usdt', // Intercambio de NTX a USDT
      'mining_claim',     // Reclamo de ganancias de minería
      'referral_commission',// Comisión recibida por referido
      'task_reward',      // Recompensa por completar una tarea
    ],
  },
  amount: {
    type: Number,
    required: true, // Siempre un valor positivo
  },
  currency: {
    type: String,
    required: true,
    enum: ['NTX', 'USDT'],
  },
  // Descripción legible para el frontend
  description: {
    type: String,
    required: true,
  },
  // Un campo flexible para guardar datos extra, como el ID de la herramienta comprada, o de qué referido vino la comisión.
  metadata: {
    type: Map,
    of: String,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Transaction', transactionSchema);