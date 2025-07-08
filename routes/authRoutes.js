// backend/routes/authRoutes.js (VERSIÓN FINAL Y VERIFICADA)

const express = require('express');
const router = express.Router();

// --- LA IMPORTACIÓN CLAVE ---
// Importamos desestructurando, esperando un objeto del controlador.
const { authTelegramUser, getUserProfile } = require('../controllers/authController');
const { authMiddleware } = require('../middleware/authMiddleware');

// @route   POST /api/auth/login
// @desc    Autentica al usuario de Telegram y devuelve un token JWT
// @access  Public
router.post('/login', authTelegramUser);

// @route   GET /api/auth/profile
// @desc    Obtiene el perfil del usuario autenticado
// @access  Private
router.get('/profile', authMiddleware, getUserProfile); // <-- Esta es probablemente la línea 15

module.exports = router;