// RUTA: backend/services/priceService.js (Refactorizado)

const axios = require('axios');
const Price = require('../models/priceModel');

const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,binancecoin,solana,tether';

/**
 * Tarea programada (Cron Job): Obtiene datos de mercado de CoinGecko y los guarda en MongoDB.
 * Esta es la única función que hablará con la API externa.
 */
const updatePricesInDB = async () => {
  console.log('[Cron Job] Ejecutando actualización de precios en MongoDB...');
  try {
    const response = await axios.get(COINGECKO_API_URL);
    
    const newPrices = {};
    const fullMarketData = {};

    response.data.forEach(coin => {
      const symbol = coin.symbol.toUpperCase();
      if (['BTC', 'ETH', 'BNB', 'SOL', 'USDT'].includes(symbol)) {
        newPrices[symbol] = coin.current_price;
        fullMarketData[symbol] = {
          name: coin.name,
          symbol: symbol,
          price: coin.current_price,
          change: coin.price_change_percentage_24h,
          image: coin.image
        };
      }
    });

    if (Object.keys(newPrices).length === 0) {
      throw new Error("No se recibieron datos válidos de CoinGecko.");
    }

    // `upsert: true` crea el documento si no existe, o lo actualiza si ya existe.
    await Price.findOneAndUpdate(
      { identifier: 'market-prices' },
      { 
        prices: newPrices,
        fullMarketData: fullMarketData,
        lastUpdated: new Date() 
      },
      { upsert: true, new: true }
    );
    console.log('[Cron Job] Base de datos de precios actualizada con éxito.');
  } catch (error) {
    console.error('[Cron Job] CRÍTICO: Fallo al actualizar los precios en la BD:', error.message);
    // No lanzamos un error aquí para no detener otros posibles procesos del cron.
  }
};

/**
 * Obtiene los datos de mercado para el frontend. Siempre devuelve los últimos datos guardados en MongoDB.
 * @returns {Promise<object>} El objeto de datos de mercado.
 */
const getPricesFromDB = async () => {
  const priceData = await Price.findOne({ identifier: 'market-prices' });
  
  if (!priceData || !priceData.fullMarketData) {
    console.warn("[Price Service] No se encontraron datos de precios en la BD. Devolviendo estructura por defecto.");
    // Devolvemos un objeto vacío para que `Object.values` en el frontend no falle.
    return {};
  }
  return priceData.fullMarketData;
};

module.exports = {
  updatePricesInDB,
  getPricesFromDB,
};