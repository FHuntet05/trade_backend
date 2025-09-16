// backend/routes/adminRoutes.js (VERSIÓN "NEXUS SYNC" + SUPERADMIN CHECKS)
const express = require('express');
const router = express.Router();

const { protectAdmin, isSuperAdmin } = require('../middleware/authMiddleware');

const {
  getPendingWithdrawals,
  processWithdrawal,
  getAllUsers,
  updateUser,
  getDashboardStats,
  getAllFactories,
  createFactory,
  updateFactory,
  deleteFactory,
  getUserDetails,
  getSettings,
  updateSettings,
  generateTwoFactorSecret,
  verifyAndEnableTwoFactor,
  getTreasuryWalletsList,
  sweepFunds,
  analyzeGasNeeds,
  dispatchGas,
  adjustUserBalance,
  sendBroadcastNotification,
  sweepGas,
  promoteUserToAdmin,
  demoteAdminToUser,
  resetAdminPassword,
  getAllTransactions,
  getPendingBlockchainTxs,
} = require('../controllers/adminController');

// --- Middleware global para admins ---
router.use(protectAdmin);

// --- Dashboard
router.route('/stats').get(getDashboardStats);

// --- Gestión de Usuarios
router.route('/users').get(getAllUsers);
router.route('/users/:id').get(getUserDetails).put(updateUser);
router.route('/users/adjust-balance/:id').post(adjustUserBalance);

// --- Gestión de Roles de Admin (Solo Super Admin)
router.route('/admins/promote').post(isSuperAdmin, promoteUserToAdmin);
router.route('/admins/demote').post(isSuperAdmin, demoteAdminToUser);
router.route('/admins/reset-password').post(isSuperAdmin, resetAdminPassword);

// --- Transacciones globales
router.route('/transactions').get(getAllTransactions);

// --- Gestión de Retiros
router.route('/withdrawals').get(getPendingWithdrawals);
router.route('/withdrawals/:id/process').put(processWithdrawal);

// --- Tesorería
router.route('/treasury/wallets').get(getTreasuryWalletsList);
router.route('/treasury/sweep-funds').post(sweepFunds);
router.route('/treasury/sweep-gas').post(sweepGas);

// --- Dispensador de Gas
router.route('/gas-dispenser/analysis').get(analyzeGasNeeds);
router.route('/gas-dispenser/dispatch').post(dispatchGas);

// --- Monitor de Blockchain
router.route('/blockchain-monitor/pending').get(getPendingBlockchainTxs);

// --- Fábricas
router.route('/factories').get(getAllFactories).post(createFactory);
router.route('/factories/:id').put(updateFactory).delete(deleteFactory);

// --- Ajustes
router.route('/settings').get(getSettings).put(updateSettings);

// --- Seguridad y 2FA
router.route('/security/2fa/generate').post(generateTwoFactorSecret);
router.route('/security/2fa/verify').post(verifyAndEnableTwoFactor);

// --- Notificaciones
router.route('/notifications/broadcast').post(sendBroadcastNotification);

module.exports = router;
