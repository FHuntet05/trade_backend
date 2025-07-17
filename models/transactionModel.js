// backend/models/transactionModel.js (VERSIÓN v18.0 - CORREGIDA)
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
      'deposit', 
      'withdrawal', 
      'purchase', 
      'mining_claim', 
      'swap_ntx_to_usdt', 
      'admin_credit', 
      'admin_debit',
      'commission',
      'sweep' // <-- AÑADIDO: Tipo para transacciones de barrido de tesorería
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
    // Nota: Dejé USDT y NTX, pero la lógica de tesorería usa variantes como USDT_TRON.
    // Esto podría requerir una refactorización futura, pero por ahora no causa conflicto.
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
});

// Para evitar errores de sobreescritura en HMR (Hot Module Replacement)
module.exports = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);