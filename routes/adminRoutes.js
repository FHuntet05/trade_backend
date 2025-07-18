// RUTA: backend/routes/adminRoutes.js (VERSIÓN LIMPIA DE PRODUCCIÓN v20.1)

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController.js');
const { protect, isAdmin } = require('../middleware/authMiddleware');

// Rutas de Dashboard y Configuración
router.get('/stats', protect, isAdmin, adminController.getDashboardStats);
router.route('/settings').get(protect, isAdmin, adminController.getSettings).put(protect, isAdmin, adminController.updateSettings);

// Rutas de Gestión de Usuarios
router.get('/users', protect, isAdmin, adminController.getAllUsers);
router.get('/users/:id/details', protect, isAdmin, adminController.getUserDetails);
router.put('/users/:id', protect, isAdmin, adminController.updateUser);
router.put('/users/:id/status', protect, isAdmin, adminController.setUserStatus);
router.post('/users/:id/adjust-balance', protect, isAdmin, adminController.adjustUserBalance);
// Rutas de Gestión de Transacciones y Retiros
router.get('/transactions', protect, isAdmin, adminController.getAllTransactions);
router.post('/transactions/manual', protect, isAdmin, adminController.createManualTransaction);
router.get('/withdrawals/pending', protect, isAdmin, adminController.getPendingWithdrawals);
router.put('/withdrawals/:id/process', protect, isAdmin, adminController.processWithdrawal);

// Rutas de Tesorería y Dispensador
router.get('/treasury/wallets-list', protect, isAdmin, adminController.getTreasuryWalletsList);
router.post('/treasury/wallet-balance', protect, isAdmin, adminController.getWalletBalance);
router.post('/sweep-funds', protect, isAdmin, adminController.sweepFunds);
router.post('/gas-dispenser/analyze', protect, isAdmin, adminController.analyzeGasNeeds);
router.post('/gas-dispenser/dispatch', protect, isAdmin, adminController.dispatchGas);

// Rutas de Gestión de Herramientas
router.route('/tools').get(protect, isAdmin, adminController.getAllTools).post(protect, isAdmin, adminController.createTool);
router.route('/tools/:id').put(protect, isAdmin, adminController.updateTool).delete(protect, isAdmin, adminController.deleteTool);

// Rutas de 2FA
router.post('/2fa/generate', protect, isAdmin, adminController.generateTwoFactorSecret);
router.post('/2fa/verify', protect, isAdmin, adminController.verifyAndEnableTwoFactor);

module.exports = router;