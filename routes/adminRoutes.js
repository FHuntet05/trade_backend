// RUTA: backend/routes/adminRoutes.js

const express = require('express');
const { protectAdmin } = require('../middleware/authMiddleware');

// --- INICIO DE LA CORRECCIÓN ---
// Se consolidan TODAS las importaciones de adminController en un solo bloque.
const {
  getDashboardStats, getPendingWithdrawals, processWithdrawal,
  getAllUsers, getUserDetails, updateUser, adjustUserBalance,
  resetAdminPassword, getAllTransactions, getPendingBlockchainTxs,
  getAllFactories, createFactory, updateFactory, deleteFactory,
  getSettings, updateSettings, generateTwoFactorSecret,
  verifyAndEnableTwoFactor, getTreasuryWalletsList, sweepFunds,
  sweepGas, analyzeGasNeeds, dispatchGas, sendBroadcastNotification,
  getProfitTiers, updateProfitTiers, getCryptoSettings, updateCryptoSetting,
  createMarketItem, getMarketItemsAdmin, updateMarketItem, deleteMarketItem,
  createQuantitativePlan, getQuantitativePlansAdmin, updateQuantitativePlan, deleteQuantitativePlan,
  getWheelConfigAdmin, adjustUserBalance, updateWheelConfigAdmin
} = require('../controllers/adminController');

// Se importa la función necesaria del investmentController por separado.
const { getAvailableCryptos } = require('../controllers/investmentController');
// --- FIN DE LA CORRECCIÓN ---

const router = express.Router();

// Todas las rutas en este archivo están protegidas por el middleware de Administrador.
router.use(protectAdmin);

// Rutas de Dashboard y Usuarios
router.get('/dashboard-stats', getDashboardStats);
router.get('/users', getAllUsers);
router.route('/users/:id').get(getUserDetails).put(updateUser);
router.post('/users/:id/adjust-balance', adjustUserBalance);
router.post('/users/:id/reset-admin-password', resetAdminPassword);

// Rutas Financieras
router.get('/transactions', getAllTransactions);
router.get('/withdrawals/pending', getPendingWithdrawals);
router.post('/withdrawals/:id/process', processWithdrawal);

// Rutas de Blockchain y Tesorería
router.get('/blockchain/pending-txs', getPendingBlockchainTxs);
router.get('/treasury/wallets', getTreasuryWalletsList);
router.post('/treasury/sweep-funds', sweepFunds);
router.post('/treasury/sweep-gas', sweepGas);
router.get('/treasury/analyze-gas', analyzeGasNeeds);
router.post('/treasury/dispatch-gas', dispatchGas);

// Rutas de Fábricas (obsoleto, a refactorizar)
router.route('/factories').get(getAllFactories).post(createFactory);
router.route('/factories/:id').put(updateFactory).delete(deleteFactory);

// Rutas de Configuración General
router.route('/settings').get(getSettings).put(updateSettings);
router.get('/settings/profit-tiers', getProfitTiers);
router.put('/settings/profit-tiers', updateProfitTiers);
router.get('/settings/crypto', getCryptoSettings);
router.put('/settings/crypto/:symbol', updateCryptoSetting);
router.route('/wheel-config').get(getWheelConfigAdmin).put(updateWheelConfigAdmin);

// Rutas de Seguridad y Notificaciones
router.post('/security/generate-2fa', generateTwoFactorSecret);
router.post('/security/enable-2fa', verifyAndEnableTwoFactor);
router.post('/notifications/broadcast', sendBroadcastNotification);

// Rutas de Planes Cuantitativos
router.route('/quantitative-plans').get(getQuantitativePlansAdmin).post(createQuantitativePlan);
router.route('/quantitative-plans/:id').put(updateQuantitativePlan).delete(deleteQuantitativePlan);
router.post('/users/:id/adjust-balance', adjustUserBalance);
// --- NUEVAS RUTAS PARA EL CONSTRUCTOR VISUAL DE MERCADO ---
router.get('/available-cryptos', getAvailableCryptos);
router.route('/market-items').get(getMarketItemsAdmin).post(createMarketItem);
router.route('/market-items/:id').put(updateMarketItem).delete(deleteMarketItem);


module.exports = router;