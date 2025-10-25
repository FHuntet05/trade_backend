// RUTA: backend/controllers/priceController.js
// --- ADAPTADO AL NUEVO SERVICIO CON DATOS COMPLETOS ---

const asyncHandler = require('express-async-handler');
// Se importa la nueva función del servicio.
const { getMarketDataOnDemand } = require('../services/priceService');

/**
 * @desc    Obtiene los datos de mercado actualizados (precio y cambio 24h).
 * @route   GET /api/market/prices
 * @access  Private
 */
const getMarketPrices = asyncHandler(async (req, res) => {
  try {
    const marketData = await getMarketDataOnDemand();
    // La respuesta ahora es un objeto más rico, con precio, cambio, etc.
    res.status(200).json(marketData);
  } catch (error) {
    res.status(503);
    throw new Error(error.message);
  }
});

module.exports = {
  getMarketPrices,
};