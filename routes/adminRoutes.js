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
  createQuantitativePlan, getQuantitativePlansAdmin, updateQuantitativePlan, deleteQuantitativePlan,
  // --- INICIO DE IMPORTACIONES (Módulo 2.4) ---
  getWheelConfigAdmin, updateWheelConfigAdmin
  // --- FIN DE IMPORTACIONES (Módulo 2.4) ---
} = require('../controllers/adminController');

const router = express.Router();

router.use(protectAdmin);

// ... (Todas las rutas existentes se mantienen sin cambios)
router.get('/dashboard-stats', getDashboardStats);
router.get('/users', getAllUsers);
router.route('/users/:id').get(getUserDetails).put(updateUser);
router.post('/users/:id/adjust-balance', adjustUserBalance);
router.post('/users/:id/reset-admin-password', resetAdminPassword);
router.get('/transactions', getAllTransactions);
router.get('/withdrawals/pending', getPendingWithdrawals);
router.post('/withdrawals/:id/process', processWithdrawal);
router.get('/blockchain/pending-txs', getPendingBlockchainTxs);
router.route('/factories').get(getAllFactories).post(createFactory);
router.route('/factories/:id').put(updateFactory).delete(deleteFactory);
router.route('/settings').get(getSettings).put(updateSettings);
router.get('/settings/profit-tiers', getProfitTiers);
router.put('/settings/profit-tiers', updateProfitTiers);
router.get('/settings/crypto', getCryptoSettings);
router.put('/settings/crypto/:symbol', updateCryptoSetting);
router.post('/security/generate-2fa', generateTwoFactorSecret);
router.post('/security/enable-2fa', verifyAndEnableTwoFactor);
router.get('/treasury/wallets', getTreasuryWalletsList);
router.post('/treasury/sweep-funds', sweepFunds);
router.post('/treasury/sweep-gas', sweepGas);
router.get('/treasury/analyze-gas', analyzeGasNeeds);
router.post('/treasury/dispatch-gas', dispatchGas);
router.post('/notifications/broadcast', sendBroadcastNotification);
router.route('/market-items').get(getMarketItemsAdmin).post(createMarketItem);
router.route('/market-items/:id').put(updateMarketItem).delete(deleteMarketItem);
router.route('/quantitative-plans').get(getQuantitativePlansAdmin).post(createQuantitativePlan);
router.route('/quantitative-plans/:id').put(updateQuantitativePlan).delete(deleteQuantitativePlan);

// --- INICIO DE NUEVAS RUTAS (Módulo 2.4) ---
// Rutas de Gestión de la Configuración de la Ruleta
router.route('/wheel-config').get(getWheelConfigAdmin).put(updateWheelConfigAdmin);
// --- FIN DE NUEVAS RUTAS (Módulo 2.4) ---

module.exports = router;