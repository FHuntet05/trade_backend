// RUTA: backend/models/settingsModel.js (VERSIÓN "NEXUS - DEPOSIT COMMISSIONS")
const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  singleton: { type: String, default: 'global_settings', unique: true },
  maintenanceMode: { type: Boolean, default: false },
  maintenanceMessage: { type: String, trim: true, default: 'La aplicación está en mantenimiento. Vuelve más tarde.' },
  minimumWithdrawal: { type: Number, default: 1.0 },
  withdrawalFeePercent: { type: Number, default: 0 },
  swapFeePercent: { type: Number, default: 0 },
  minimumSwap: { type: Number, default: 10000 },
  adminTelegramId: { type: String, trim: true, default: '' },
  bnbAlertThreshold: { type: Number, default: 0.05 },
  trxAlertThreshold: { type: Number, default: 100 },
  
  // [NEXUS MONETIZATION] - INICIO DE LA CORRECCIÓN
  // Campos para comisiones por compra de herramientas (ya existentes, solo se renombran para claridad).
  commissionLevel1: { type: Number, default: 0 }, // Para compras
  commissionLevel2: { type: Number, default: 0 }, // Para compras
  commissionLevel3: { type: Number, default: 0 }, // Para compras

  // Nuevos campos para comisiones por el PRIMER DEPÓSITO de un referido.
  depositCommissionLevel1: { type: Number, default: 0 }, // % de comisión por depósito Nivel 1
  depositCommissionLevel2: { type: Number, default: 0 }, // % de comisión por depósito Nivel 2
  depositCommissionLevel3: { type: Number, default: 0 }, // % de comisión por depósito Nivel 3
  // [NEXUS MONETIZATION] - FIN DE LA CORRECCIÓN

}, { timestamps: true });

module.exports = mongoose.model('Setting', settingsSchema);