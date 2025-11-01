// RUTA: backend/models/settingsModel.js

const mongoose = require('mongoose');

const profitTierSchema = new mongoose.Schema({
  minBalance: { type: Number, required: true },
  maxBalance: { type: Number, required: true },
  profitPercentage: { type: Number, required: true, min: 0, max: 100 }
});

const STATIC_WALLET_PRESETS = [
  {
    key: 'btc_main',
    currency: 'BTC',
    chain: 'Bitcoin',
    icon: 'BTC',
    address: '',
    instructions: 'Envía únicamente BTC a esta dirección. No envíes otros tokens ni redes diferentes.',
    isActive: false
  },
  {
    key: 'eth_main',
    currency: 'ETH',
    chain: 'Ethereum',
    icon: 'ETH',
    address: '',
    instructions: 'Envía únicamente ETH en la red principal de Ethereum. No envíes tokens ERC-20 a menos que se indique.',
    isActive: false
  },
  {
    key: 'ltc_main',
    currency: 'LTC',
    chain: 'Litecoin',
    icon: 'LTC',
    address: '',
    instructions: 'Verifica comisiones y envía solo Litecoin (LTC).',
    isActive: false
  },
  {
    key: 'trx_main',
    currency: 'TRX',
    chain: 'TRON',
    icon: 'TRX',
    address: '',
    instructions: 'Envía únicamente TRX a esta dirección en la red TRON.',
    isActive: false
  },
  {
    key: 'sol_main',
    currency: 'SOL',
    chain: 'Solana',
    icon: 'SOL',
    address: '',
    instructions: 'Envía únicamente SOL en la red Solana (SPL).',
    isActive: false
  },
  {
    key: 'ton_main',
    currency: 'TON',
    chain: 'TON',
    icon: 'TON',
    address: '',
    instructions: 'Envía únicamente TON. No envíes otros tokens de la red.',
    isActive: false
  }
];

const DEPOSIT_OPTION_PRESETS = [
  {
    key: 'usdt_bep20',
    name: 'USDT (BEP20)',
    currency: 'USDT',
    chain: 'BSC',
    type: 'automatic',
    address: '',
    instructions: 'Envía únicamente USDT por la red BSC. Los fondos se acreditarán automáticamente tras la confirmación en blockchain.',
    minAmount: 5,
    maxAmount: 0,
    isActive: true,
    displayOrder: 0,
    icon: 'USDT'
  },
  {
    key: 'btc_manual',
    name: 'Bitcoin (BTC)',
    currency: 'BTC',
    chain: 'Bitcoin',
    type: 'manual',
    instructions: 'Recibirás la dirección fija al generar tu ticket. Envía solo BTC y comparte el comprobante si soporte lo solicita.',
    minAmount: 10,
    maxAmount: 0,
    isActive: false,
    displayOrder: 5,
    icon: 'BTC',
    staticWalletKey: 'btc_main'
  },
  {
    key: 'eth_manual',
    name: 'Ethereum (ETH)',
    currency: 'ETH',
    chain: 'Ethereum',
    type: 'manual',
    instructions: 'Recibirás la dirección fija al generar tu ticket. Envía solo ETH en la red principal.',
    minAmount: 10,
    maxAmount: 0,
    isActive: false,
    displayOrder: 6,
    icon: 'ETH',
    staticWalletKey: 'eth_main'
  },
  {
    key: 'ltc_manual',
    name: 'Litecoin (LTC)',
    currency: 'LTC',
    chain: 'Litecoin',
    type: 'manual',
    instructions: 'Recibirás la dirección fija al generar tu ticket. Envía solo Litecoin (LTC).',
    minAmount: 10,
    maxAmount: 0,
    isActive: false,
    displayOrder: 7,
    icon: 'LTC',
    staticWalletKey: 'ltc_main'
  },
  {
    key: 'trx_manual',
    name: 'TRON (TRX)',
    currency: 'TRX',
    chain: 'TRON',
    type: 'manual',
    instructions: 'Recibirás la dirección fija al generar tu ticket. Envía solo TRX en la red TRON.',
    minAmount: 10,
    maxAmount: 0,
    isActive: false,
    displayOrder: 8,
    icon: 'TRX',
    staticWalletKey: 'trx_main'
  },
  {
    key: 'sol_manual',
    name: 'Solana (SOL)',
    currency: 'SOL',
    chain: 'Solana',
    type: 'manual',
    instructions: 'Recibirás la dirección fija al generar tu ticket. Envía solo SOL.',
    minAmount: 10,
    maxAmount: 0,
    isActive: false,
    displayOrder: 9,
    icon: 'SOL',
    staticWalletKey: 'sol_main'
  },
  {
    key: 'ton_manual',
    name: 'Toncoin (TON)',
    currency: 'TON',
    chain: 'TON',
    type: 'manual',
    instructions: 'Recibirás la dirección fija al generar tu ticket. Envía solo TON.',
    minAmount: 10,
    maxAmount: 0,
    isActive: false,
    displayOrder: 10,
    icon: 'TON',
    staticWalletKey: 'ton_main'
  }
];

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

const staticWalletSchema = new mongoose.Schema({
  key: { type: String, required: true },
  currency: { type: String, required: true },
  chain: { type: String, required: true },
  address: { type: String, default: '' },
  instructions: { type: String, default: '' },
  icon: { type: String, default: '' },
  isActive: { type: Boolean, default: false }
});

const depositOptionSchema = new mongoose.Schema({
  key: { type: String, required: true },
  name: { type: String, required: true },
  currency: { type: String, required: true },
  chain: { type: String, default: 'BSC' },
  type: { type: String, enum: ['automatic', 'manual'], default: 'manual' },
  address: { type: String, default: '' },
  instructions: { type: String, default: '' },
  minAmount: { type: Number, default: 0 },
  maxAmount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  displayOrder: { type: Number, default: 0 },
  icon: { type: String, default: '' },
  staticWalletKey: { type: String, default: '' }
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

  staticWallets: {
    type: [staticWalletSchema],
    default: () => STATIC_WALLET_PRESETS.map((wallet) => ({ ...wallet }))
  },

  depositOptions: {
    type: [depositOptionSchema],
    default: () => DEPOSIT_OPTION_PRESETS.map((option) => ({ ...option }))
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
module.exports.STATIC_WALLET_PRESETS = STATIC_WALLET_PRESETS;
module.exports.DEPOSIT_OPTION_PRESETS = DEPOSIT_OPTION_PRESETS;