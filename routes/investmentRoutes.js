// RUTA: backend/routes/investmentRoutes.js (VERSIÓN ACTUALIZADA)

const express = require('express');
const router = express.Router();
const { protect, protectAdmin } = require('../middleware/authMiddleware'); // Asumiendo que protectAdmin existe
const {
  getAvailableMarketItems,
  createMarketPurchase,
  getAvailableCryptos, // Importamos la nueva función
} = require('../controllers/investmentController');

// --- INICIO DE LA MODIFICACIÓN ---
// Nueva ruta solo para administradores
router.get('/available-cryptos', protect, getAvailableCryptos);
// --- FIN DE LA MODIFICACIÓN ---


// Rutas para usuarios autenticados
router.use(protect);

router.get('/items', getAvailableMarketItems);
router.post('/purchase', createMarketPurchase);


module.exports = router;