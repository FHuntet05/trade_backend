// --- START OF FILE backend/routes/toolRoutes.js ---

const express = require('express');
const router = express.Router();

// 1. Importamos las funciones lógicas desde nuestro controlador.
// Esto mantiene nuestro código limpio y organizado.
const { getTools, purchaseWithBalance } = require('../controllers/toolController');

// 2. Importamos el middleware de autenticación. Lo dejaremos comentado
// por ahora para no interrumpir tus pruebas, pero es VITAL para la seguridad.
// const authMiddleware = require('../middleware/authMiddleware');

// --- Definición de Rutas ---

/**
 * @route   GET /api/tools
 * @desc    Obtener la lista completa de herramientas (VIP 1-10).
 * @access  Privado (Debería requerir autenticación)
 * @notes   Esta ruta ahora utiliza la función 'getTools' del controlador, 
 *          centralizando la lógica de la aplicación.
 */
router.get('/', /* authMiddleware, */ getTools);

/**
 * @route   POST /api/tools/purchase-with-balance
 * @desc    Permite a un usuario comprar una herramienta usando su saldo interno.
 * @access  Privado (Debería requerir autenticación)
 * @notes   Esta es la ruta que faltaba en tu archivo de prueba. Sin ella,
 *          las compras con saldo no funcionarían. Utiliza 'purchaseWithBalance'
 *          del controlador.
 */
router.post('/purchase-with-balance', /* authMiddleware, */ purchaseWithBalance);

module.exports = router;

// --- END OF FILE backend/routes/toolRoutes.js ---