// backend/routes/authRoutes.js (SIN CAMBIOS - VALIDADO)
const express = require('express');
const router = express.Router();
const { syncUser, getUserProfile, loginAdmin } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Sincroniza al usuario de la app de Telegram (ruta pública).
router.post('/sync', syncUser);

// Obtiene el perfil del usuario autenticado de Telegram (protegida con 'protect' de usuario).
router.get('/profile', protect, getUserProfile);

// Autentica a un administrador (ruta pública).
router.post('/login/admin', loginAdmin);

module.exports = router;