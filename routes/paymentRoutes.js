// backend/routes/paymentRoutes.js (CORREGIDO)
const express = require('express');
const router = express.Router();

const { generateAddress, getPrices } = require('../controllers/paymentController');

// --- CORRECCIÓN CLAVE ---
// Importamos 'protect' en lugar de la variable inexistente 'authMiddleware'.
const { protect } = require('../middleware/authMiddleware');

// Usamos 'protect' para asegurar las rutas.
router.post('/generate-address', protect, generateAddress);
router.get('/prices', protect, getPrices);

module.exports = router;