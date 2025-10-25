// RUTA: backend/routes/marketRoutes.js

const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { getMarketPrices } = require('../controllers/priceController');

const router = express.Router();

// --- INICIO DE LA CORRECCIÓN CRÍTICA ---
// @desc    Obtiene el estado actual de los precios desde la caché en memoria.
// @route   GET /api/market/prices
// @access  Public
//
// Se elimina el middleware 'protect' de esta ruta específica.
// Esto es necesario para que el frontend pueda cargar los precios
// de las criptomonedas inmediatamente, incluso antes de que la
// sincronización del usuario haya finalizado, evitando así el error 404.
router.route('/prices').get(getMarketPrices);
// --- FIN DE LA CORRECCIÓN CRÍTICA ---

// Si en el futuro añades más rutas relacionadas con el mercado que requieran
// que el usuario esté autenticado (ej. realizar una operación), puedes
// añadirlas aquí usando el middleware 'protect'.
//
// Ejemplo:
// router.route('/trade').post(protect, executeTrade);

module.exports = router;