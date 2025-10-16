// backend/routes/adminRoutes.js (VERSIÓN "NEXUS RECOVERY" - RUTAS SINCRONIZADAS)
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
  resetAdminPassword,
  getAllTransactions,
  getPendingBlockchainTxs,
  getProfitTiers,          // <-- Added
  updateProfitTiers,       // <-- Added
  getCryptoSettings,       // <-- Added for completeness
  updateCryptoSetting,     // <-- Added for completeness
} = require('../controllers/adminController');

// --- Middleware global para admins ---
router.use(protectAdmin);

// --- Dashboard
router.route('/stats').get(getDashboardStats);

// --- Gestión de Usuarios
router.route('/users').get(getAllUsers);
router.route('/users/:id').get(getUserDetails).put(updateUser);
router.route('/users/adjust-balance/:id').post(adjustUserBalance);

// ======================= INICIO DE LA CORRECCIÓN CRÍTICA =======================
// La lógica de promover/degradar ahora está dentro de updateUser.
// La ruta para resetear la contraseña es ahora más específica y segura.

// Ya no se necesitan rutas separadas para promover/degradar.
// router.route('/admins/promote').post(isSuperAdmin, promoteUserToAdmin); // <-- ELIMINADA
// router.route('/admins/demote').post(isSuperAdmin, demoteAdminToUser);   // <-- ELIMINADA

// Nueva ruta para resetear la contraseña de un administrador específico
router.route('/users/:id/reset-password').post(resetAdminPassword);
// ======================== FIN DE LA CORRECCIÓN CRÍTICA =========================


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

// --- Ganancias por Saldo
router.route('/profit-tiers')
  .get(getProfitTiers)
  .put(updateProfitTiers);

// --- Configuración de Criptomonedas
router.route('/crypto-settings')
  .get(getCryptoSettings);

router.route('/crypto-settings/:symbol')
  .put(updateCryptoSetting);

// --- Seguridad y 2FA
router.route('/security/2fa/generate').post(generateTwoFactorSecret);
router.route('/security/2fa/verify').post(verifyAndEnableTwoFactor);

// --- Notificaciones
router.route('/notifications/broadcast').post(sendBroadcastNotification);

module.exports = router;