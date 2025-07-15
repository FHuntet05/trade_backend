// backend/routes/toolRoutes.js (CORREGIDO Y SEGURO)
const express = require('express');
const router = express.Router();

const { getTools, purchaseWithBalance } = require('../controllers/toolController');

// --- CORRECCIÓN CLAVE ---
// Importamos 'protect' correctamente para asegurar las rutas.
const { protect } = require('../middleware/authMiddleware');

/**
 * @route   GET /api/tools
 * @desc    Obtener la lista completa de herramientas.
 * @access  Privado (Asegurado con el middleware 'protect')
 */
router.get('/', protect, getTools);

/**
 * @route   POST /api/tools/purchase-with-balance
 * @desc    Permite a un usuario comprar una herramienta usando su saldo.
 * @access  Privado (Asegurado con el middleware 'protect')
 */
router.post('/purchase-with-balance', protect, purchaseWithBalance);

module.exports = router;