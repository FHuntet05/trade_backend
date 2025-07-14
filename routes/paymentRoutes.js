// backend/routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const { generateAddress } = require('../controllers/paymentController');
const authMiddleware = require('../middleware/authMiddleware'); // Asumo que tienes un middleware de autenticación

// @route   POST /api/payment/generate-address
// @desc    Genera o recupera una dirección de depósito para un usuario
// @access  Private
router.post('/generate-address', authMiddleware, generateAddress);

module.exports = router;