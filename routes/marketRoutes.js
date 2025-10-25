// RUTA: backend/routes/marketRoutes.js
// --- INICIO DE LA CORRECCIÓN COMPLETA ---

const express = require('express');
const { protect } = require('../middleware/authMiddleware');
// Se importa el nombre correcto del controlador que definimos arriba.
const { getMarketPrices } = require('../controllers/priceController');

const router = express.Router();

/**
 * @route   GET /api/market/prices
 * @desc    Endpoint para que el frontend obtenga los precios de mercado
 *          actualizados mediante HTTP Polling.
 * @access  Private
 */
router.route('/prices').get(protect, getMarketPrices);

module.exports = router;

// --- FIN DE LA CORRECCIÓN COMPLETA ---