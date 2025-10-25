// RUTA: backend/routes/adminRoutes.js

const express = require('express');
const { protectAdmin } = require('../middleware/authMiddleware');
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
  // --- INICIO DE IMPORTACIONES (Módulo 2.3) ---
  createQuantitativePlan, getQuantitativePlansAdmin, updateQuantitativePlan, deleteQuantitativePlan
  // --- FIN DE IMPORTACIONES (Módulo 2.3) ---
} = require('../controllers/adminController');

const router = express.Router();

// Aplicar middleware de protección de administrador a todas las rutas
router.use(protectAdmin);

// Rutas del Dashboard
router.get('/dashboard-stats', getDashboardStats);

// Rutas de Usuarios
router.get('/users', getAllUsers);
router.route('/users/:id').get(getUserDetails).put(updateUser);
router.post('/users/:id/adjust-balance', adjustUserBalance);
router.post('/users/:id/reset-admin-password', resetAdminPassword);

// Rutas de Transacciones y Retiros
router.get('/transactions', getAllTransactions);
router.get('/withdrawals/pending', getPendingWithdrawals);
router.post('/withdrawals/:id/process', processWithdrawal);
router.get('/blockchain/pending-txs', getPendingBlockchainTxs);

// Rutas de Fábricas/Herramientas (Tools)
router.route('/factories').get(getAllFactories).post(createFactory);
router.route('/factories/:id').put(updateFactory).delete(deleteFactory);

// Rutas de Configuración General (Settings)
router.route('/settings').get(getSettings).put(updateSettings);
router.get('/settings/profit-tiers', getProfitTiers);
router.put('/settings/profit-tiers', updateProfitTiers);
router.get('/settings/crypto', getCryptoSettings);
router.put('/settings/crypto/:symbol', updateCryptoSetting);

// Rutas de Seguridad
router.post('/security/generate-2fa', generateTwoFactorSecret);
router.post('/security/enable-2fa', verifyAndEnableTwoFactor);

// Rutas de Tesorería y Blockchain
router.get('/treasury/wallets', getTreasuryWalletsList);
router.post('/treasury/sweep-funds', sweepFunds);
router.post('/treasury/sweep-gas', sweepGas);
router.get('/treasury/analyze-gas', analyzeGasNeeds);
router.post('/treasury/dispatch-gas', dispatchGas);

// Rutas de Notificaciones
router.post('/notifications/broadcast', sendBroadcastNotification);

// Rutas de Items de Mercado
router.route('/market-items').get(getMarketItemsAdmin).post(createMarketItem);
router.route('/market-items/:id').put(updateMarketItem).delete(deleteMarketItem);

// --- INICIO DE NUEVAS RUTAS (Módulo 2.3) ---
// Rutas de Gestión de Planes Cuantitativos
router.route('/quantitative-plans').get(getQuantitativePlansAdmin).post(createQuantitativePlan);
router.route('/quantitative-plans/:id').put(updateQuantitativePlan).delete(deleteQuantitativePlan);
// --- FIN DE NUEVAS RUTAS (Módulo 2.3) ---


module.exports = router;