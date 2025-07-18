// RUTA: backend/models/settingsModel.js (CON UMBRALES DE ALERTA)
const mongoose = require('mongoose');
const settingsSchema = new mongoose.Schema({
  singleton: { type: String, default: 'global_settings', unique: true },
  maintenanceMode: { type: Boolean, default: false },
  maintenanceMessage: { type: String, trim: true, default: 'La aplicación está en mantenimiento. Vuelve más tarde.' },
  minimumWithdrawal: { type: Number, default: 1.0 },
  withdrawalFeePercent: { type: Number, default: 0 },
  swapFeePercent: { type: Number, default: 0 },
  minimumSwap: { type: Number, default: 10000 },
  
  // --- NUEVOS CAMPOS PARA ALERTAS PROACTIVAS ---
  adminTelegramId: { type: String, trim: true, default: '' }, // ID de Telegram del admin/grupo para recibir alertas
  bnbAlertThreshold: { type: Number, default: 0.05 }, // Umbral en BNB
  trxAlertThreshold: { type: Number, default: 100 },  // Umbral en TRX

}, { timestamps: true });
module.exports = mongoose.model('Setting', settingsSchema);