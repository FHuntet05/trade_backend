// backend/routes/referralRoutes.js (NUEVO ARCHIVO)
const express = require('express');
const router = express.Router();
const { processReferral } = require('../controllers/referralController');
const { protect } = require('../middleware/authMiddleware');

// Ruta protegida. Solo un usuario logueado puede procesar su referido.
router.post('/process', protect, processReferral);

module.exports = router;