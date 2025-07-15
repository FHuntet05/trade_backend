// backend/routes/rankingRoutes.js (CORREGIDO Y FUNCIONAL)
const express = require('express');
const router = express.Router();

// Asumo que tienes un controlador para el ranking, si no, debemos crearlo.
// Por ahora, lo importamos esperando que exista en 'controllers/rankingController.js'
const { getRanking } = require('../controllers/rankingController');

// --- LA CORRECCIÓN CLAVE ---
// CAMBIO 1: Importamos 'protect' directamente, que es la función de middleware que necesitamos.
const { protect } = require('../middleware/authMiddleware');

// CAMBIO 2: Usamos el middleware 'protect' correctamente.
// Esto asegurará que cualquier ruta definida en este archivo estará protegida
// y requerirá un token JWT válido.
router.use(protect);

// Ahora la ruta está protegida.
router.get('/', getRanking);

module.exports = router;