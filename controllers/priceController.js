// RUTA: backend/controllers/priceController.js
// --- INICIO DE LA REFACTORIZACIÓN COMPLETA ---

const asyncHandler = require('express-async-handler');
// Se importa la función correcta desde el servicio de precios, no el modelo de la BD.
const { getAllPricesFromCache } = require('../services/priceService');

/**
 * @desc    Obtiene el estado actual de los precios desde la caché en memoria.
 * @route   GET /api/market/prices
 * @access  Private
 */
const getMarketPrices = asyncHandler(async (req, res) => {
  // 1. Se llama a la función del servicio que accede a la caché en tiempo real.
  const prices = getAllPricesFromCache();

  // 2. Verificación: Si la caché por alguna razón está vacía, se informa al cliente.
  if (!prices || Object.keys(prices).length === 0) {
    console.warn('[Price Controller] Se solicitó precios, pero la caché está vacía.');
    // Se puede devolver un 204 (No Content) o un 404. 404 es más explícito.
    res.status(404);
    throw new Error('Los datos de precios no están disponibles en este momento.');
  }

  // 3. Se envía la respuesta directamente en el formato que el frontend espera:
  //    { "BTC": 65000, "ETH": 3100, ... }
  res.status(200).json(prices);
});

module.exports = {
  getMarketPrices,
};

// --- FIN DE LA REFACTORIZACIÓN COMPLETA ---