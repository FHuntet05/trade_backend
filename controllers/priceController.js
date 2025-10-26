// RUTA: backend/controllers/priceController.js
// --- VERSIÓN FINAL Y COMPLETA ---

const asyncHandler = require('express-async-handler');
const { getPricesFromDB } = require('../services/priceService');

/**
 * @desc    Obtiene los datos de mercado más recientes desde la base de datos.
 * @route   GET /api/market/prices
 * @access  Public (como se definió en marketRoutes.js)
 * @returns {JSON} Un objeto con los datos de mercado completos para cada criptomoneda.
 *          Ej: { "BTC": { name: "Bitcoin", price: 65000, ... }, "ETH": { ... } }
 */
const getMarketPrices = asyncHandler(async (req, res) => {
  // 1. Llama a la función del servicio que consulta MongoDB.
  // Esta función está diseñada para ser resiliente: siempre devolverá el último
  // registro válido de la base de datos, incluso si el cron job de actualización falló.
  const marketDataFromDB = await getPricesFromDB();

  // 2. Valida la respuesta del servicio.
  if (!marketDataFromDB) {
    // Este caso es muy improbable si el cron job ha corrido al menos una vez,
    // pero es una buena práctica de programación defensiva.
    console.warn('[Price Controller] El servicio de precios no devolvió datos. Enviando respuesta vacía.');
    res.status(200).json({}); // Devuelve un objeto vacío para no crashear el frontend.
    return;
  }

  // 3. Envía los datos obtenidos de la base de datos al frontend.
  // El estado de la respuesta siempre será 200 OK, ya que estamos sirviendo
  // desde nuestra propia base de datos, eliminando la dependencia de servicios externos.
  res.status(200).json(marketDataFromDB);
});

module.exports = {
  getMarketPrices,
};