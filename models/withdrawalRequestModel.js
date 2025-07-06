// backend/models/withdrawalRequestModel.js
const mongoose = require('mongoose');

const withdrawalRequestSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  network: {
    type: String,
    required: true,
    enum: ['TRX', 'USDT-BEP20', 'USDT-TRC20', 'BNB']
  },
  walletAddress: {
    type: String,
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'completed', 'rejected'],
    default: 'pending'
  },
  adminNotes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('WithdrawalRequest', withdrawalRequestSchema);