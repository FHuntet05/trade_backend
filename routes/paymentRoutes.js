// backend/routes/paymentRoutes.js (VERSIÓN FINAL Y COMPLETA)
const express = require('express');
const router = express.Router();

// Importamos los controladores.
const { generateAddress, getPrices } = require('../controllers/paymentController');

// Importamos el middleware de autenticación.
const { authMiddleware } = require('../middleware/authMiddleware');

// @route   POST /api/payment/generate-address
// @desc    Genera o recupera una dirección de depósito.
// @access  Private
router.post('/generate-address', authMiddleware, generateAddress);


// @route   GET /api/payment/prices
// @desc    Obtiene los precios actuales de las criptomonedas.
// @access  Private
router.get('/prices', authMiddleware, getPrices);


module.exports = router;