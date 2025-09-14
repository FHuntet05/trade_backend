// backend/routes/adminRoutes.js (FASE "INSPECTIO" v1.0 - PROTEGIDO CON `protectAdmin`)
const express = require('express');
const router = express.Router();

// [INSPECTIO - CORRECCIÓN] Importamos el nuevo middleware `protectAdmin`.
// `isAdmin` puede seguir usándose para una doble verificación o para rutas específicas
// si algunos admins tuvieran más permisos que otros en el futuro.
const { protectAdmin, isAdmin } = require('../middleware/authMiddleware');

// Importamos todos los controladores del adminController
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
  resetAdminPassword
} = require('../controllers/adminController');

// --- APLICACIÓN DEL MIDDLEWARE DE SEGURIDAD ---
// [INSPECTIO - CORRECCIÓN CRÍTICA]
// Aplicamos `protectAdmin` a TODAS las rutas definidas en este archivo.
// Cualquier petición a /api/admin/* ahora debe tener un token de administrador válido.
router.use(protectAdmin);

// --- DEFINICIÓN DE RUTAS ---

// Dashboard
router.route('/stats').get(getDashboardStats);

// Gestión de Usuarios
router.route('/users').get(getAllUsers);
router.route('/users/:id').get(getUserDetails).put(updateUser);
router.route('/users/adjust-balance/:id').post(adjustUserBalance);

// Gestión de Roles de Admin (Solo Super Admin, la lógica está en el frontend)
router.route('/admins/promote').post(promoteUserToAdmin);
router.route('/admins/demote').post(demoteAdminToUser);
router.route('/admins/reset-password').post(resetAdminPassword);

// Gestión de Retiros
router.route('/withdrawals').get(getPendingWithdrawals);
router.route('/withdrawals/:id/process').put(processWithdrawal);

// Tesorería
router.route('/treasury/wallets').get(getTreasuryWalletsList);
router.route('/treasury/sweep-funds').post(sweepFunds);
router.route('/treasury/sweep-gas').post(sweepGas);

// Dispensador de Gas
router.route('/gas-dispenser/analysis').get(analyzeGasNeeds);
router.route('/gas-dispenser/dispatch').post(dispatchGas);

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