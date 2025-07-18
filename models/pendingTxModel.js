// RUTA: backend/models/pendingTxModel.js (NUEVO ARCHIVO)

const mongoose = require('mongoose');

const pendingTxSchema = new mongoose.Schema({
  txHash: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  chain: {
    type: String,
    required: true,
    enum: ['BSC', 'TRON'],
  },
  status: {
    type: String,
    required: true,
    enum: ['PENDING', 'CONFIRMED', 'FAILED'],
    default: 'PENDING',
    index: true,
  },
  type: {
    type: String,
    required: true,
    enum: ['GAS_DISPATCH', 'USDT_SWEEP'],
  },
  metadata: {
    type: Map,
    of: String,
  },
  lastChecked: {
    type: Date,
  },
}, {
  timestamps: true,
  collection: 'pendingtxs',
});

module.exports = mongoose.model('PendingTx', pendingTxSchema);