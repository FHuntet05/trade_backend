// RUTA: backend/routes/adminRoutes.js

const express = require('express');
const router = express.Router();

const { protectAdmin, isSuperAdmin } = require('../middleware/authMiddleware');

const {
  getDashboardStats,
  getPendingWithdrawals,
  processWithdrawal,
  getAllUsers,
  getUserDetails,
  updateUser,
  adjustUserBalance,
  resetAdminPassword,
  getAllTransactions,
  getPendingBlockchainTxs,
  getSettings,
  updateSettings,
  generateTwoFactorSecret,
  verifyAndEnableTwoFactor,
  getTreasuryWalletsList,
  sweepFunds,
  sweepGas,
  analyzeGasNeeds,
  dispatchGas,
  sendBroadcastNotification,
  getProfitTiers,
  updateProfitTiers,
  getCryptoSettings,
  updateCryptoSetting,
  // Nuevas importaciones para Market Items
  createMarketItem,
  getMarketItemsAdmin,
  updateMarketItem,
  deleteMarketItem,
} = require('../controllers/adminController');

// --- Middleware global para proteger todas las rutas de admin ---
router.use(protectAdmin);

// --- Dashboard ---
router.route('/stats').get(getDashboardStats);

// --- Gestión de Usuarios ---
router.route('/users').get(getAllUsers);
router.route('/users/:id').get(getUserDetails).put(updateUser);
router.route('/users/adjust-balance/:id').post(adjustUserBalance);
router.route('/users/:id/reset-password').post(resetAdminPassword);

// --- Transacciones globales ---
router.route('/transactions').get(getAllTransactions);

// --- Gestión de Retiros ---
router.route('/withdrawals').get(getPendingWithdrawals);
router.route('/withdrawals/:id/process').put(processWithdrawal);

// --- Gestión de Items de Mercado ---
router.route('/market-items')
  .post(createMarketItem)
  .get(getMarketItemsAdmin);

router.route('/market-items/:id')
  .put(updateMarketItem)
  .delete(deleteMarketItem);

// --- Tesorería ---
router.route('/treasury/wallets').get(getTreasuryWalletsList);
router.route('/treasury/sweep-funds').post(sweepFunds);
router.route('/treasury/sweep-gas').post(sweepGas);

// --- Dispensador de Gas ---
router.route('/gas-dispenser/analysis').get(analyzeGasNeeds);
router.route('/gas-dispenser/dispatch').post(dispatchGas);

// --- Monitor de Blockchain ---
router.route('/blockchain-monitor/pending').get(getPendingBlockchainTxs);

// --- Ajustes Generales ---
router.route('/settings').get(getSettings).put(updateSettings);

// --- Ajustes de Niveles de Ganancia ---
router.route('/profit-tiers')
  .get(getProfitTiers)
  .put(updateProfitTiers);

// --- Ajustes de Criptomonedas ---
router.route('/crypto-settings')
  .get(getCryptoSettings);
router.route('/crypto-settings/:symbol')
  .put(updateCryptoSetting);

// --- Seguridad y 2FA ---
router.route('/security/2fa/generate').post(generateTwoFactorSecret);
router.route('/security/2fa/verify').post(verifyAndEnableTwoFactor);

// --- Notificaciones ---
router.route('/notifications/broadcast').post(sendBroadcastNotification);

module.exports = router;