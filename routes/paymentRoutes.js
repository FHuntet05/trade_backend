// RUTA: backend/routes/paymentRoutes.js (VERSIÓN "NEXUS - HÍBRIDA")

const express = require('express');
const router = express.Router();
// [NEXUS HÍBRIDO] Importamos la nueva función del controlador.
const { getDepositOptions, getPrices } = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware');

// [NEXUS HÍBRIDO - REEMPLAZO]
// La antigua ruta POST /generate-address ha sido deprecada y eliminada.
// Se reemplaza por una única ruta GET que devuelve todas las opciones de depósito.
router.get('/deposit-options', protect, getDepositOptions);

// La ruta para obtener precios se mantiene.
router.get('/prices', protect, getPrices);

module.exports = router;