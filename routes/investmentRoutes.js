const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getAvailableCryptos,
  createInvestment,
  getActiveInvestments,
  getInvestmentHistory,
  getInvestmentStats
} = require('../controllers/investmentController');

// Todas las rutas requieren autenticación
router.use(protect);

// Obtener criptomonedas disponibles para inversión
router.get('/available', getAvailableCryptos);

// Crear nueva inversión
router.post('/create', createInvestment);

// Obtener inversiones activas del usuario
router.get('/active', getActiveInvestments);

// Obtener historial de inversiones
router.get('/history', getInvestmentHistory);

// Obtener estadísticas de inversión
router.get('/stats', getInvestmentStats);

module.exports = router;