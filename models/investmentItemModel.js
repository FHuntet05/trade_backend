// RUTA: backend/models/investmentItemModel.js

const mongoose = require('mongoose');

const investmentItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'El nombre del item es obligatorio.'],
    trim: true,
  },
  symbol: {
    type: String,
    required: [true, 'El símbolo/ticker es obligatorio.'],
    uppercase: true,
    trim: true,
  },
  iconUrl: {
    type: String,
    default: '',
  },
  description: {
    type: String,
    required: [true, 'La descripción es obligatoria.'],
  },
  dailyProfitPercentage: {
    type: Number,
    required: [true, 'El porcentaje de ganancia diario es obligatorio.'],
    min: 0,
  },
  durationDays: {
    type: Number,
    required: [true, 'La duración en días es obligatoria.'],
    min: 1,
  },
  minInvestment: {
    type: Number,
    required: [true, 'La inversión mínima es obligatoria.'],
    default: 10,
  },
  maxInvestment: {
    type: Number,
    required: [true, 'La inversión máxima es obligatoria.'],
    default: 10000,
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

const InvestmentItem = mongoose.model('InvestmentItem', investmentItemSchema);

module.exports = InvestmentItem;