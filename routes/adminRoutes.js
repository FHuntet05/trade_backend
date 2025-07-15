// backend/routes/adminRoutes.js (VERSIÓN CORREGIDA Y FINAL)

const express = require('express');
const router = express.Router();

// Importación de controladores
const adminController = require('../controllers/adminController.js');

// Importación de middleware de seguridad
const { protect, isAdmin } = require('../middleware/authMiddleware');

// --- Rutas de Dashboard y Estadísticas ---
router.get('/stats', protect, isAdmin, adminController.getDashboardStats);
router.get('/test', protect, isAdmin, adminController.getAdminTestData);

// --- Rutas de Configuración Global ---
router.route('/settings')
  .get(protect, isAdmin, adminController.getSettings)
  .put(protect, isAdmin, adminController.updateSettings);

// --- Rutas de Gestión de Usuarios ---
router.get('/users', protect, isAdmin, adminController.getAllUsers);
router.get('/users/:id/details', protect, isAdmin, adminController.getUserDetails);
router.put('/users/:id', protect, isAdmin, adminController.updateUser);
router.put('/users/:id/status', protect, isAdmin, adminController.setUserStatus);
router.get('/users/:id/referrals', protect, isAdmin, adminController.getUserReferrals);

// --- Rutas de Gestión de Transacciones ---
// LA BARRA DIAGONAL ERRÓNEA HA SIDO ELIMINADA DE AQUÍ
router.get('/transactions', protect, isAdmin, adminController.getAllTransactions);
router.post('/transactions/manual', protect, isAdmin, adminController.createManualTransaction);

// --- Rutas de Gestión de Retiros ---
router.get('/withdrawals', protect, isAdmin, adminController.getPendingWithdrawals);
router.put('/withdrawals/:id', protect, isAdmin, adminController.processWithdrawal);

// --- Rutas de Gestión de Herramientas ---
router.route('/tools')
  .get(protect, isAdmin, adminController.getAllTools)
  .post(protect, isAdmin, adminController.createTool);
router.route('/tools/:id')
  .put(protect, isAdmin, adminController.updateTool)
  .delete(protect, isAdmin, adminController.deleteTool);

// --- Rutas de Configuración de 2FA ---
router.post('/2fa/generate', protect, isAdmin, adminController.generateTwoFactorSecret);
router.post('/2fa/verify', protect, isAdmin, adminController.verifyAndEnableTwoFactor);

module.exports = router;