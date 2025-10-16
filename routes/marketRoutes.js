// RUTA: backend/routes/marketRoutes.js

const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { getPrices } = require('../controllers/priceController'); // Importamos el nuevo controlador

const router = express.Router();

// --- NUEVA RUTA PARA OBTENER PRECIOS ---
// Esta ruta permite al frontend obtener la lista de precios cacheados.
// Está protegida para que solo usuarios logueados puedan acceder.
router.route('/prices').get(protect, getPrices);


// --- RUTAS EXISTENTES (SE MANTIENEN POR AHORA) ---
// Aquí irían las futuras rutas para gestionar los items del mercado (comprar, vender, etc.)
// router.route('/').get(protect, getMarketItems);
// router.route('/buy').post(protect, buyMarketItem);


module.exports = router;