// backend/routes/toolRoutes.js
const express = require('express');
const router = express.Router();

// Importamos las funciones del controlador ACTUALIZADAS
const { getTools, purchaseWithBalance } = require('../controllers/toolController');

// Importamos el middleware de autenticación
const authMiddleware = require('../middleware/authMiddleware');

// Aplicamos el middleware de autenticación a todas las rutas
router.use(authMiddleware);

// Definimos las rutas específicas
router.get('/', getTools);
router.post('/purchase-with-balance', purchaseWithBalance); // <-- Ruta actualizada

// Exportamos el router
module.exports = router;