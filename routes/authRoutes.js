// backend/routes/authRoutes.js (CÓDIGO COMPLETO, RESTAURADO Y CORREGIDO)
const express = require('express');
const router = express.Router();
const { syncUser, getUserProfile, loginAdmin } = require('../controllers/authController');
const { verifyLoginToken } = require('../controllers/twoFactorAuthController');
const { protect } = require('../middleware/authMiddleware');

// La ruta /login se reemplaza conceptualmente por /sync para la Mini App
router.post('/sync', syncUser);

// Se mantienen las rutas existentes para no romper la funcionalidad
router.get('/profile', protect, getUserProfile);
router.post('/login/admin', loginAdmin);
router.post('/2fa/verify-login', verifyLoginToken);

module.exports = router;