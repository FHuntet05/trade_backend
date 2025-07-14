// backend/routes/paymentRoutes.js (VERSIÓN FINAL CON IMPORTACIÓN CORREGIDA)
const express = require('express');
const router = express.Router();
const { generateAddress, getPrices } = require('../controllers/paymentController');

// --- LA CORRECCIÓN ESTÁ AQUÍ ---
// Ya que authMiddleware.js exporta un objeto { authMiddleware: ... },
// debemos desestructurar para obtener la función.
const { authMiddleware } = require('../middleware/authMiddleware');

// @route   POST /api/payment/generate-address
// @desc    Genera o recupera una dirección de depósito para un usuario autenticado.
// @access  Private
router.post('/generate-address', authMiddleware, generateAddress);

module.exports = router;