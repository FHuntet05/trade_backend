// RUTA: backend/routes/authRoutes.js
// --- VERSIÓN FINAL CON RUTA DE CONFIGURACIÓN TEMPORAL ---

const express = require('express');
const router = express.Router();
const { syncUser, getUserProfile, loginAdmin, setupSuperUser } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/sync', syncUser);
router.get('/profile', protect, getUserProfile);
router.post('/login/admin', loginAdmin);

// --- NUEVA RUTA DE CONFIGURACIÓN TEMPORAL ---
// Esta ruta es para un solo uso. Debería ser eliminada después de configurar el admin.
router.post('/setup-super-user', setupSuperUser);

module.exports = router;