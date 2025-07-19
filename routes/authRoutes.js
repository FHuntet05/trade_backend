// backend/routes/authRoutes.js (VERSIÓN FLUJO DIRECTO v24.2 - LIMPIEZA)
const express = require('express');
const router = express.Router();
const { validateUser, getUserProfile, loginAdmin } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// La ruta ahora es para VALIDAR, no para sincronizar todo.
router.post('/validate', validateUser);

// Rutas existentes que se mantienen
router.get('/profile', protect, getUserProfile);
router.post('/login/admin', loginAdmin);

// Se elimina la ruta de 2FA que no se está utilizando en este flujo.

module.exports = router;