// RUTA: backend/controllers/priceController.js
// --- INICIO DE LA ADAPTACIÓN AL NUEVO SERVICIO ---

const asyncHandler = require('express-async-handler');
// Se importa la nueva función "on-demand" del servicio.
const { getPricesOnDemand } = require('../services/priceService');

/**
 * @desc    Obtiene los precios de mercado actualizados llamando a un proveedor externo.
 * @route   GET /api/market/prices
 * @access  Private
 */
const getMarketPrices = asyncHandler(async (req, res) => {
  try {
    // 1. Se llama directamente a la nueva función del servicio.
    const prices = await getPricesOnDemand();

    // 2. Si todo va bien, se devuelven los precios.
    res.status(200).json(prices);

  } catch (error) {
    // 3. Si el servicio lanza un error (ej. CoinGecko caído), se devuelve un error 503.
    res.status(503); // 503 Service Unavailable
    throw new Error(error.message);
  }
});

module.exports = {
  getMarketPrices,
};

// --- FIN DE LA ADAPTACIÓN AL NUEVO SERVICIO ---