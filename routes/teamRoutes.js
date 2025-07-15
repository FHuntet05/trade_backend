// backend/routes/teamRoutes.js (CORREGIDO)
const express = require('express');
const router = express.Router();
const { getTeamStats, getLevelDetails } = require('../controllers/teamController');

// --- CORRECCIÓN CLAVE ---
// Importamos 'protect' directamente del objeto exportado por authMiddleware.
const { protect } = require('../middleware/authMiddleware');

// Aplicamos el middleware 'protect' a todas las rutas de este archivo.
router.use(protect);

router.get('/stats', getTeamStats);
router.get('/level-details/:level', getLevelDetails);

module.exports = router;