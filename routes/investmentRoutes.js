// RUTA: backend/routes/investmentRoutes.js

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getAvailableMarketItems,
  createMarketPurchase,
} = require('../controllers/investmentController');

// Todas las rutas de este archivo requieren que el usuario esté autenticado.
router.use(protect);

// Ruta para obtener la lista de todos los items de mercado disponibles para comprar.
// GET /api/investments/items
router.get('/items', getAvailableMarketItems);

// Ruta para que un usuario compre un item de mercado.
// POST /api/investments/purchase
router.post('/purchase', createMarketPurchase);

// (Aquí se pueden añadir futuras rutas relacionadas, como obtener el historial de compras del usuario)

module.exports = router;