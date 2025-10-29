// RUTA: backend/models/investmentItemModel.js (VERSIÓN MEJORADA PARA CONSTRUCTOR VISUAL)

const mongoose = require('mongoose');

const investmentItemSchema = new mongoose.Schema({
  // --- Información Básica ---
  name: {
    type: String,
    required: [true, 'El nombre del item es obligatorio.'],
    trim: true,
  },
  // --- Vinculación con Cripto en Tiempo Real ---
  linkedCryptoSymbol: {
    type: String,
    required: [true, 'Se debe vincular una criptomoneda (ej. BTC, ETH).'],
    uppercase: true,
    trim: true,
  },
  // --- Datos Financieros del Plan ---
  price: {
    type: Number,
    required: [true, 'El precio de compra es obligatorio.'],
    min: 0,
  },
  durationDays: {
    type: Number,
    required: [true, 'La duración en días es obligatoria.'],
    min: 1,
  },
  dailyProfitAmount: {
    type: Number,
    required: [true, 'La ganancia diaria en USDT es obligatoria.'],
    min: 0,
  },
  totalRoiPercentage: {
    type: Number,
    required: [true, 'El ROI total a mostrar es obligatorio.'],
    min: 0,
  },
  // --- Apariencia y Marketing ---
  imageUrl: {
    type: String,
    required: [true, 'Se requiere una URL de imagen.'],
  },
  saleDiscountPercentage: {
    type: Number,
    default: 0, // 0 significa que no hay oferta.
    min: 0,
    max: 100,
  },
  // --- Estado y Métricas ---
  purchaseCount: {
    type: Number,
    default: 0, // Contador para "Más Popular".
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
}, {
  timestamps: true,
});

const InvestmentItem = mongoose.model('InvestmentItem', investmentItemSchema);

module.exports = InvestmentItem;