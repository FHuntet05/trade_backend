// backend/routes/toolRoutes.js (VERSIÓN DE PRUEBA FINAL - SIN MIDDLEWARE)

const express = require('express');
const router = express.Router();
const Tool = require('../models/toolModel');

// ATENCIÓN: Se ha quitado 'authMiddleware' temporalmente para la prueba.
router.get('/', async (req, res) => {
  try {
    const tools = await Tool.find().sort({ vipLevel: 1 });
    res.json(tools);
  } catch (error) {
    console.error('Error al obtener herramientas (ruta de prueba):', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
});

module.exports = router;