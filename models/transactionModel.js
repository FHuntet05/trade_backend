// backend/models/transactionModel.js (VERSIÓN v18.10 - CORRECCIÓN CRÍTICA DE COLECCIÓN)
const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
    index: true,
  },
  type: {
    type: String,
    required: true,
    enum: [
      'deposit', 'withdrawal', 'purchase', 'mining_claim', 
      'swap_ntx_to_usdt', 'admin_credit', 'admin_debit',
      'commission', 'sweep'
    ],
    index: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'completed', 'rejected', 'failed'],
    default: 'completed',
    index: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    required: true,
    enum: ['USDT', 'NTX', 'USDT_TRON', 'USDT_BSC', 'BNB', 'TRX'],
  },
  description: {
    type: String,
    required: true,
  },
  metadata: {
    type: Map,
    of: String,
  },
}, {
  timestamps: true,
  // CORRECCIÓN DEFINITIVA: Se fuerza a Mongoose a usar la colección con el nombre exacto de la base de datos.
  // Esto resuelve el bloqueo infinito en todas las rutas que usan este modelo.
  collection: 'transactions' 
});

// BLINDAJE ANTI-CRASH: Previene errores de sobreescritura con nodemon.
module.exports = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);