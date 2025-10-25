// RUTA: backend/models/pendingPurchaseModel.js

const mongoose = require('mongoose');

const pendingPurchaseSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QuantitativeItem',
    required: true,
  },
  amount: {
    type: Number,
    required: [true, 'El monto de la compra es obligatorio.'],
  },
  depositAddress: {
    type: String,
    required: [true, 'La dirección de depósito es obligatoria.'],
  },
  status: {
    type: String,
    enum: ['pending_payment', 'paid', 'expired', 'manual_confirmation'],
    default: 'pending_payment',
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    // El ticket expira 30 minutos después de su creación.
    default: () => new Date(Date.now() + 30 * 60 * 1000), 
  },
  detectedTxHash: {
    type: String, // Para almacenar el hash de la transacción de la blockchain si se detecta
    default: null,
  },
}, {
  timestamps: true,
});

// Crear un índice TTL (Time-To-Live) para que MongoDB elimine automáticamente los tickets
// que están en estado 'pending_payment' después de un tiempo prudencial (ej. 24 horas)
// para mantener la colección limpia. No afecta la lógica de 'expiresAt'.
pendingPurchaseSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400, partialFilterExpression: { status: 'pending_payment' } });

const PendingPurchase = mongoose.model('PendingPurchase', pendingPurchaseSchema);

module.exports = PendingPurchase;