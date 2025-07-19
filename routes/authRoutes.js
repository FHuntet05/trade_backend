// backend/routes/authRoutes.js (CÓDIGO COMPLETO, INTEGRADO Y CORREGIDO)
const express = require('express');
const router = express.Router();
// Importamos todos los controladores necesarios
const { syncUser, getUserProfile, loginAdmin } = require('../controllers/authController');
const { verifyLoginToken } = require('../controllers/twoFactorAuthController');
const { protect } = require('../middleware/authMiddleware');

// Ruta principal para la Mini App (sustituye a /login)
router.post('/sync', syncUser);

// Rutas existentes que se mantienen
router.get('/profile', protect, getUserProfile);
router.post('/login/admin', loginAdmin);
router.post('/2fa/verify-login', verifyLoginToken);

module.exports = router;