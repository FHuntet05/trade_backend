// RUTA: backend/controllers/priceController.js

const asyncHandler = require('express-async-handler');
const Price = require('../models/priceModel');

/**
 * @desc    Obtiene todos los precios de criptomonedas cacheados desde la base de datos.
 * @route   GET /api/prices
 * @access  Private (accesible por usuarios autenticados)
 */
const getPrices = asyncHandler(async (req, res) => {
  try {
    const prices = await Price.find({}).select('ticker priceUsd -_id');

    if (!prices) {
      res.status(404);
      throw new Error('No se encontraron precios en la base de datos.');
    }

    res.status(200).json({ 
      success: true, 
      message: 'Precios obtenidos correctamente.',
      data: prices 
    });

  } catch (error) {
    console.error('[Price Controller] Error fetching prices from DB:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error del servidor al obtener los precios.' 
    });
  }
});

module.exports = {
  getPrices,
};