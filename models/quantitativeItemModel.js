// RUTA: backend/models/quantitativeItemModel.js

const mongoose = require('mongoose');

const quantitativeItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'El nombre del plan es obligatorio.'],
    trim: true,
  },
  dailyPercentage: {
    type: Number,
    required: [true, 'El porcentaje de ganancia diario es obligatorio.'],
    min: 0,
  },
  price: {
    type: Number,
    required: [true, 'El precio del plan es obligatorio.'],
    min: 0,
  },
  durationDays: {
    type: Number,
    required: [true, 'La duración en días es obligatoria.'],
    min: 1,
  },
  totalReturnPercentage: {
    type: Number,
    required: [true, 'El porcentaje de retorno total es obligatorio.'],
    min: 0,
  },
  minInvestment: {
    type: Number,
    required: [true, 'La inversión mínima es obligatoria.'],
    default: 0,
  },
  maxInvestment: {
    type: Number,
    required: [true, 'La inversión máxima es obligatoria.'],
    default: 100000,
  },
  isOnSale: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  displayOrder: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

const QuantitativeItem = mongoose.model('QuantitativeItem', quantitativeItemSchema);

module.exports = QuantitativeItem;