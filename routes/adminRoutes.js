// backend/routes/adminRoutes.js (COMPLETO Y PROTEGIDO)

const express = require('express');
const router = express.Router();
const { 
  createManualTransaction, // <-- Importamos
  getAdminTestData, 
  getAllUsers, 
  updateUser,
  setUserStatus,
  getDashboardStats,
  getAllTransactions
} = require('../controllers/adminController.js');
const { protect, isAdmin } = require('../middleware/authMiddleware');

router.get('/stats', protect, isAdmin, getDashboardStats);
router.get('/users', protect, isAdmin, getAllUsers);
router.put('/users/:id', protect, isAdmin, updateUser);
router.put('/users/:id/status', protect, isAdmin, setUserStatus);
router.get('/transactions', protect, isAdmin, getAllTransactions);

// Nueva ruta para transacciones manuales
router.post('/transactions/manual', protect, isAdmin, createManualTransaction); // <-- NUEVA RUTA

router.get('/test', protect, isAdmin, getAdminTestData);

module.exports = router;