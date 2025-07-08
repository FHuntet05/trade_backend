const express = require('express');
const router = express.Router();
const toolController = require('../controllers/toolController');
const { authMiddleware } = require('../middleware/authMiddleware');

// Aplicamos el middleware de autenticación a todas las rutas
router.use(authMiddleware);

// Definimos las rutas específicas
router.get('/', getTools);
router.get('/', authMiddleware, toolController.getTools);

// Exportamos el router
module.exports = router;