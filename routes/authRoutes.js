// backend/routes/authRoutes.js (COMPLETO Y FINAL)
const express = require('express');
const router = express.Router();
const { authTelegramUser, getUserProfile, loginAdmin } = require('../controllers/authController');
const { verifyLoginToken } = require('../controllers/twoFactorAuthController'); // <-- Importamos
const { protect } = require('../middleware/authMiddleware');

// Rutas de Usuario
router.post('/login', authTelegramUser);
router.get('/profile', protect, getUserProfile); 

// Rutas de Admin
router.post('/login/admin', loginAdmin);
router.post('/2fa/verify-login', verifyLoginToken); // <-- NUEVA RUTA

module.exports = router;