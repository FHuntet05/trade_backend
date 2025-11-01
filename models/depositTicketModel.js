// RUTA: backend/models/depositTicketModel.js
// Modelo para gestionar tickets de depósito únicos

const mongoose = require('mongoose');

const depositTicketSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  amount: {
    type: Number,
    required: true,
    min: [0.01, 'El monto mínimo es 0.01 USDT']
  },
  currency: {
    type: String,
    required: true,
    trim: true,
    default: 'USDT',
  },
  methodKey: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  methodName: {
    type: String,
    trim: true,
    default: '',
  },
  methodType: {
    type: String,
    enum: ['automatic', 'manual'],
    default: 'automatic',
  },
  depositAddress: {
    type: String,
    default: null,
  },
  chain: {
    type: String,
    default: null,
    trim: true,
  },
  instructions: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['pending', 'awaiting_manual_review', 'processing', 'completed', 'expired', 'cancelled', 'rejected'],
    default: 'pending',
    index: true,
  },
  expiresAt: {
    type: Date,
    default: function() {
      return this.methodType === 'automatic'
        ? new Date(Date.now() + 30 * 60 * 1000)
        : null;
    },
  },
  detectedTxHash: {
    type: String,
    default: null,
  },
  completedAt: {
    type: Date,
    default: null,
  },
  manualSubmission: {
    proofUrl: { type: String, default: '' },
    notes: { type: String, default: '' },
    submittedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  metadata: {
    type: Map,
    of: String,
    default: () => new Map(),
  }
}, {
  timestamps: true,
  collection: 'deposittickets'
});

// Índice TTL para limpiar automáticamente tickets expirados después de 24 horas
depositTicketSchema.index(
  { createdAt: 1 }, 
  { 
    expireAfterSeconds: 86400, 
    partialFilterExpression: { status: 'pending', methodType: 'automatic' } 
  }
);

// Método para verificar si el ticket está expirado
depositTicketSchema.methods.isExpired = function() {
  if (!this.expiresAt) {
    return false;
  }
  return new Date() > this.expiresAt && this.status === 'pending';
};

// Método para marcar como completado
depositTicketSchema.methods.markAsCompleted = async function(txHash) {
  this.status = 'completed';
  this.detectedTxHash = txHash;
  this.completedAt = new Date();
  return await this.save();
};

const DepositTicket = mongoose.model('DepositTicket', depositTicketSchema);

module.exports = DepositTicket;
