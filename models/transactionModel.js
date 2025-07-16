// backend/models/transactionModel.js (VERSIÓN v18.0 - CURRENCIES AMPLIADAS)
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
      'admin_credit', 'admin_debit', 'sweep'
    ],
  },
  amount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    required: true,
    // --- CAMPO CORREGIDO ---
    enum: ['NTX', 'USDT', 'USDT_BSC', 'USDT_TRON'], 
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'completed', 'rejected'],
    default: 'completed', 
  },
  description: {
    type: String,
    required: true,
  },
  adminNotes: {
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