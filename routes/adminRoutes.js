// RUTA: backend/routes/adminRoutes.js (VERSIÓN "NEXUS SYNC")
const express = require('express');
const router = express.Router();

const { protectAdmin } = require('../middleware/authMiddleware');

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
  // [NEXUS SYNC] Importamos los nuevos controladores.
  getAllTransactions,
  getPendingBlockchainTxs
} = require('../controllers/adminController');

// --- APLICACIÓN DEL MIDDLEWARE DE SEGURIDAD ---
router.use(protectAdmin);

// --- DEFINICIÓN DE RUTAS ---

// Dashboard
router.route('/stats').get(getDashboardStats);

// Gestión de Usuarios
router.route('/users').get(getAllUsers);
// [NEXUS SYNC - REPAIR] La ruta de detalles es /:id, no /:id/details. Corregido para que coincida con el frontend.
router.route('/users/:id').get(getUserDetails).put(updateUser);
router.route('/users/adjust-balance/:id').post(adjustUserBalance);

// Gestión de Roles de Admin (Solo Super Admin)
router.route('/admins/promote').post(promoteUserToAdmin);
router.route('/admins/demote').post(demoteAdminToUser);
router.route('/admins/reset-password').post(resetAdminPassword);
// [NEXUS SYNC - REPAIR] Se elimina la ruta de baneo '/admins/:id/status' que no tenía implementación
// y se unifica en el endpoint genérico de updateUser.

// [NEXUS SYNC] NUEVA RUTA: Gestión de Transacciones Globales
router.route('/transactions').get(getAllTransactions);

// Gestión de Retiros
router.route('/withdrawals').get(getPendingWithdrawals);
router.route('/withdrawals/:id/process').put(processWithdrawal);

// Tesorería
// [NEXUS SYNC - REPAIR] Se corrige la ruta de 'wallets-list' a 'wallets'.
router.route('/treasury/wallets').get(getTreasuryWalletsList);
router.route('/treasury/sweep-funds').post(sweepFunds);
router.route('/treasury/sweep-gas').post(sweepGas);

// Dispensador de Gas
router.route('/gas-dispenser/analysis').get(analyzeGasNeeds);
router.route('/gas-dispenser/dispatch').post(dispatchGas);

// [NEXUS SYNC] NUEVA RUTA: Monitor de Blockchain
router.route('/blockchain-monitor/pending').get(getPendingBlockchainTxs);

// Gestión de Fábricas/Herramientas
router.route('/factories').get(getAllFactories).post(createFactory);
router.route('/factories/:id').put(updateFactory).delete(deleteFactory);

// Ajustes del Sistema
router.route('/settings').get(getSettings).put(updateSettings);

// Seguridad y 2FA
router.route('/security/2fa/generate').post(generateTwoFactorSecret);
router.route('/security/2fa/verify').post(verifyAndEnableTwoFactor);

// Notificaciones
router.route('/notifications/broadcast').post(sendBroadcastNotification);

module.exports = router;