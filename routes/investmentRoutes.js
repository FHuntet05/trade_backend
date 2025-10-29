// RUTA: backend/routes/investmentRoutes.js (VERSIÓN LIMPIA Y CORRECTA)

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware'); // Middleware correcto para usuarios
const {
  getAvailableMarketItems,
  createMarketPurchase,
  // getAvailableCryptos, // --- ELIMINADO DE AQUÍ ---
} = require('../controllers/investmentController');

// Todas las rutas de este archivo requieren que el USUARIO esté autenticado.
router.use(protect);

// Ruta para obtener la lista de todos los items de mercado disponibles para comprar.
router.get('/items', getAvailableMarketItems);

// Ruta para que un usuario compre un item de mercado.
router.post('/purchase', createMarketPurchase);


module.exports = router;