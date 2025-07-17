// backend/models/transactionModel.js (VERSIÓN ESTABLE)
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
      'commission'
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
    enum: ['USDT', 'NTX'],
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

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;