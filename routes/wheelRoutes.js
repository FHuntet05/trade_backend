// RUTA: backend/routes/wheelRoutes.js

const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { getWheelConfig, spinWheel } = require('../controllers/wheelController');

const router = express.Router();

// Todas las rutas aquí están protegidas y requieren autenticación de usuario.
router.use(protect);

// @desc    Obtiene la configuración visual de la ruleta para el frontend.
// @route   GET /api/wheel/config
router.route('/config').get(getWheelConfig);

// @desc    Inicia un giro de la ruleta para el usuario.
// @route   POST /api/wheel/spin
router.route('/spin').post(spinWheel);

module.exports = router;