// backend/models/transactionModel.js (COMPLETO CON ESTADO DE TRANSACCIÓN)

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
      'deposit', 'withdrawal', 'purchase', 'swap_ntx_to_usdt', 
      'mining_claim', 'referral_commission', 'task_reward', 
      'admin_credit', 'admin_debit',
    ],
  },
  amount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    required: true,
    enum: ['NTX', 'USDT'],
  },
  status: { // <-- NUEVO CAMPO
    type: String,
    required: true,
    enum: ['pending', 'completed', 'rejected'],
    // La mayoría de transacciones se completan al instante. 
    // Los retiros se deben crear explícitamente como 'pending'.
    default: 'completed', 
  },
  description: {
    type: String,
    required: true,
  },
  adminNotes: { // <-- NUEVO CAMPO PARA AUDITORÍA
    type: String,
    trim: true,
  },
  metadata: {
    type: Map,
    of: String,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Transaction', transactionSchema);