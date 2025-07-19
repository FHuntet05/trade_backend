// backend/routes/authRoutes.js (VERSIÓN CORREGIDA v24.0)
const express = require('express');
const router = express.Router();
// ======================= INICIO DE LA CORRECCIÓN DE RUTAS =======================
// Importamos la nueva función 'syncUser' y las que se conservan.
const { syncUser, getUserProfile, loginAdmin } = require('../controllers/authController');
const { verifyLoginToken } = require('../controllers/twoFactorAuthController');
const { protect } = require('../middleware/authMiddleware');

// La nueva ruta para la sincronización inicial del usuario desde la Mini App.
router.post('/sync', syncUser);
// ======================== FIN DE LA CORRECCIÓN DE RUTAS =========================
router.post('/validate', validateUser);
// Rutas existentes que se mantienen
router.get('/profile', protect, getUserProfile);
router.post('/login/admin', loginAdmin);
router.post('/2fa/verify-login', verifyLoginToken);

// Se elimina la ruta obsoleta 'POST /login'.

module.exports = router;