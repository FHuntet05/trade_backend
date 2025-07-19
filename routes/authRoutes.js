// backend/routes/authRoutes.js (CÓDIGO SIMPLIFICADO Y FINAL)
const express = require('express');
const router = express.Router();
const { syncUser, getUserProfile, loginAdmin } = require('../controllers/authController');
const { verifyLoginToken } = require('../controllers/twoFactorAuthController');
const { protect } = require('../middleware/authMiddleware');

// La ruta principal para la Mini App es ahora /sync. Es un POST que sincroniza y devuelve una sesión.
router.post('/sync', syncUser);

// Se mantienen las rutas existentes para otras funcionalidades (perfil, admin).
router.get('/profile', protect, getUserProfile);
router.post('/login/admin', loginAdmin);
router.post('/2fa/verify-login', verifyLoginToken);

module.exports = router;