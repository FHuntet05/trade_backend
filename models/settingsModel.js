// RUTA: backend/models/settingsModel.js (VERSIÓN "NEXUS - REFINED & SIMPLIFIED")
const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  singleton: { type: String, default: 'global_settings', unique: true },
  
  // Controles del Sistema
  withdrawalsEnabled: { type: Boolean, default: false },
  maintenanceMode: { type: Boolean, default: false },
  maintenanceMessage: { type: String, trim: true, default: 'La aplicación está en mantenimiento. Vuelve más tarde.' },
  
  // Parámetros Financieros
  minimumWithdrawal: { type: Number, default: 1.0 },
  withdrawalFeePercent: { type: Number, default: 0 },
  swapFeePercent: { type: Number, default: 0 },
  minimumSwap: { type: Number, default: 10000 },

  // Alertas y Notificaciones
  adminTelegramId: { type: String, trim: true, default: '' },
  bnbAlertThreshold: { type: Number, default: 0.05 },
  
  // [NEXUS REFINEMENT] - INICIO DE LA REFACTORIZACIÓN
  // Se mantienen únicamente las comisiones por el PRIMER DEPÓSITO.
  depositCommissionLevel1: { type: Number, default: 0 }, // % de comisión por depósito Nivel 1
  depositCommissionLevel2: { type: Number, default: 0 }, // % de comisión por depósito Nivel 2
  depositCommissionLevel3: { type: Number, default: 0 }, // % de comisión por depósito Nivel 3

  // Los siguientes campos de comisión por compra han sido eliminados por ser obsoletos:
  // - commissionLevel1
  // - commissionLevel2
  // - commissionLevel3
  // - fixedCommissionAmount
  // [NEXUS REFINEMENT] - FIN DE LA REFACTORIZACIÓN

}, { timestamps: true });

module.exports = mongoose.model('Setting', settingsSchema);