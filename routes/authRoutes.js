// backend/routes/authRoutes.js (COMPLETO Y CORREGIDO)

const express = require('express');
const router = express.Router();
const { authTelegramUser, getUserProfile, loginAdmin } = require('../controllers/authController');

// --- LA CORRECIÓN CLAVE ESTÁ AQUÍ ---
// Importamos 'protect' en lugar de 'authMiddleware'.
const { protect } = require('../middleware/authMiddleware');

// @route   POST /api/auth/login
// @desc    Autentica al usuario de Telegram y devuelve un token JWT
// @access  Public
router.post('/login', authTelegramUser);

// @route   POST /api/auth/login/admin
// @desc    Autentica a un administrador con usuario y contraseña
// @access  Public
router.post('/login/admin', loginAdmin);

// @route   GET /api/auth/profile
// @desc    Obtiene el perfil del usuario autenticado (válido para cualquier usuario con token)
// @access  Private
// --- Y LA CORRECIÓN SE APLICA AQUÍ ---
// Usamos 'protect' como nuestro middleware.
router.get('/profile', protect, getUserProfile); 

module.exports = router;