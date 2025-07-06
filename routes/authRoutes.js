// backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { authTelegramUser, getUserProfile } = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
// @route   POST /api/auth/telegram
// @desc    Autentica o registra un usuario desde la Mini App de Telegram
// @access  Public
router.post('/telegram', authTelegramUser);


// @route   GET /api/auth/profile
// @desc    Obtiene el perfil del usuario actualmente logueado
// @access  Private (protegido por nuestro middleware)
router.get('/profile', authMiddleware, getUserProfile);

module.exports = router;