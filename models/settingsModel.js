// RUTA: backend/models/settingsModel.js (VERSIÓN "NEXUS - STATE SYNC FIX")
const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  singleton: { type: String, default: 'global_settings', unique: true },
  
  // [NEXUS SYNC FIX] - INICIO DE LA CORRECIÓN
  // Campo booleano para el control global de los retiros.
  withdrawalsEnabled: { type: Boolean, default: false },
  // [NEXUS SYNC FIX] - FIN DE LA CORRECIÓN
  
  maintenanceMode: { type: Boolean, default: false },
  maintenanceMessage: { type: String, trim: true, default: 'La aplicación está en mantenimiento. Vuelve más tarde.' },
  minimumWithdrawal: { type: Number, default: 1.0 },
  withdrawalFeePercent: { type: Number, default: 0 },
  swapFeePercent: { type: Number, default: 0 },
  minimumSwap: { type: Number, default: 10000 },
  adminTelegramId: { type: String, trim: true, default: '' },
  bnbAlertThreshold: { type: Number, default: 0.05 },
  
  // Comisiones por compra de herramientas
  commissionLevel1: { type: Number, default: 0 },
  commissionLevel2: { type: Number, default: 0 },
  commissionLevel3: { type: Number, default: 0 },

  // Comisiones por el PRIMER DEPÓSITO de un referido.
  depositCommissionLevel1: { type: Number, default: 0 },
  depositCommissionLevel2: { type: Number, default: 0 },
  depositCommissionLevel3: { type: Number, default: 0 },
  
  // [NEXUS SYNC FIX] - Campo para la comisión fija (restaurado)
  fixedCommissionAmount: { type: Number, default: 0 },

}, { timestamps: true });

module.exports = mongoose.model('Setting', settingsSchema);