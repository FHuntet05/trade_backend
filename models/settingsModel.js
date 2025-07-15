// backend/models/settingsModel.js (COMPLETO Y CORREGIDO)
const mongoose = require('mongoose');
const settingsSchema = new mongoose.Schema({
  singleton: { type: String, default: 'global_settings', unique: true, },
  maintenanceMode: { type: Boolean, default: false, },
  maintenanceMessage: { type: String, trim: true, default: 'La aplicación está en mantenimiento. Vuelve más tarde.', },
  minimumWithdrawal: { type: Number, default: 1.0, }, // <-- CORREGIDO A 1
  withdrawalFeePercent: { type: Number, default: 0, }, // <-- CORREGIDO A 0
  swapFeePercent: { type: Number, default: 0, }, // <-- CORREGIDO A 0
  minimumSwap: { type: Number, default: 10000, }, // <-- NUEVO PARÁMETRO
}, { timestamps: true });
module.exports = mongoose.model('Setting', settingsSchema);