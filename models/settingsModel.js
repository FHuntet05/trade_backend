// RUTA: backend/models/settingsModel.js

const mongoose = require('mongoose');

const profitTierSchema = new mongoose.Schema({
  minBalance: { type: Number, required: true },
  maxBalance: { type: Number, required: true },
  profitPercentage: { type: Number, required: true, min: 0, max: 100 }
});

const cryptoSettingSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  name: { type: String, required: true },
  icon: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  minInvestment: { type: Number, required: true },
  maxInvestment: { type: Number, required: true },
  displayOrder: { type: Number, default: 0 },
  profitRange: {
    min: { type: Number, required: true },
    max: { type: Number, required: true }
  }
});

const settingsSchema = new mongoose.Schema({
  singleton: { type: String, default: 'global_settings', unique: true },
  
  // Sistema de Ganancias por Saldo
  profitTiers: {
    type: [profitTierSchema],
    default: [
      { minBalance: 0, maxBalance: 100, profitPercentage: 1 },
      { minBalance: 101, maxBalance: 200, profitPercentage: 1.5 },
      { minBalance: 201, maxBalance: 500, profitPercentage: 2 },
      { minBalance: 501, maxBalance: 1500, profitPercentage: 2.5 },
      { minBalance: 1501, maxBalance: 999999, profitPercentage: 3 }
    ]
  },

  // Configuración de Criptomonedas
  cryptoSettings: {
    type: [cryptoSettingSchema],
    default: []
  },
  
  // Controles del Sistema
  withdrawalsEnabled: { type: Boolean, default: false },
  maintenanceMode: { type: Boolean, default: false },
  maintenanceMessage: { type: String, trim: true, default: 'La aplicación está en mantenimiento. Vuelve más tarde.' },
  
  // --- INICIO DE LA MODIFICACIÓN (Bono Diario) ---
  dailyBonusAmount: { 
    type: Number, 
    default: 0.1 
  }, // Monto en USDT del bono diario
  // --- FIN DE LA MODIFICACIÓN (Bono Diario) ---

  // --- INICIO DE LA MODIFICACIÓN (Ganancias Pasivas) ---
  isPassiveProfitEnabled: { 
    type: Boolean, 
    default: false 
  }, // Interruptor para activar/desactivar ganancias pasivas por saldo
  // --- FIN DE LA MODIFICACIÓN (Ganancias Pasivas) ---

  // Parámetros Financieros
  minimumWithdrawal: { type: Number, default: 1.0 },
  withdrawalFeePercent: { type: Number, default: 0 },
  swapFeePercent: { type: Number, default: 0 },
  minimumSwap: { type: Number, default: 10000 },

  // Alertas y Notificaciones
  adminTelegramId: { type: String, trim: true, default: '' },
  bnbAlertThreshold: { type: Number, default: 0.05 },
  
  depositCommissionLevel1: { type: Number, default: 0 },
  depositCommissionLevel2: { type: Number, default: 0 },
  depositCommissionLevel3: { type: Number, default: 0 },

}, { timestamps: true });

// Método para calcular el porcentaje de ganancia basado en el saldo
settingsSchema.methods.calculateProfitPercentage = function(balance) {
  const tier = this.profitTiers
    .sort((a, b) => a.minBalance - b.minBalance)
    .find(tier => balance >= tier.minBalance && balance <= tier.maxBalance);
  return tier ? tier.profitPercentage : 0;
};

// Método para obtener la configuración de una crypto específica
settingsSchema.methods.getCryptoSettings = function(symbol) {
  return this.cryptoSettings.find(crypto => crypto.symbol === symbol);
};

// Método para actualizar la configuración de una crypto
settingsSchema.methods.updateCryptoSettings = async function(symbol, settings) {
  const index = this.cryptoSettings.findIndex(crypto => crypto.symbol === symbol);
  if (index === -1) {
    this.cryptoSettings.push(settings);
  } else {
    this.cryptoSettings[index] = { ...this.cryptoSettings[index], ...settings };
  }
  return this.save();
};

const Setting = mongoose.model('Setting', settingsSchema);

module.exports = Setting;