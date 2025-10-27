// RUTA: backend/routes/authRoutes.js
// --- VERSIÓN SEGURA SIN LA RUTA DE CONFIGURACIÓN ---

const express = require('express');
const router = express.Router();
// Se elimina la importación de setupSuperUser
const { syncUser, getUserProfile, loginAdmin } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/sync', syncUser);
router.get('/profile', protect, getUserProfile);
router.post('/login/admin', loginAdmin);

// --- RUTA DE CONFIGURACIÓN TEMPORAL ELIMINADA ---

module.exports = router;