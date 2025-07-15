// backend/models/transactionModel.js (COMPLETO CON TIPOS DE TRANSACCIÓN DE ADMIN)

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
      'deposit',
      'withdrawal',
      'purchase',
      'swap_ntx_to_usdt',
      'mining_claim',
      'referral_commission',
      'task_reward',
      'admin_credit', // <-- NUEVO: Crédito manual por un admin
      'admin_debit',  // <-- NUEVO: Débito manual por un admin
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

module.exports = mongoose.model('Transaction', transactionSchema);