// backend/routes/toolRoutes.js (VERSIÓN DE PRUEBA PARA AISLAR EL ERROR)

const express = require('express');
const router = express.Router();
const Tool = require('../models/toolModel'); // <-- Importamos el modelo directamente aquí
const { authMiddleware } = require('../middleware/authMiddleware');

// La lógica del controlador está ahora DENTRO de la ruta
router.get('/', authMiddleware, async (req, res) => {
  try {
    const tools = await Tool.find().sort({ vipLevel: 1 });
    res.json(tools);
  } catch (error) {
    console.error('Error al obtener herramientas:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
});

module.exports = router;