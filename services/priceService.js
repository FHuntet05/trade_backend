// RUTA: backend/services/priceService.js
// --- VERSIÓN DE DEBUGGING CON CONSOLE.LOGS ---

const axios = require('axios');
const Price = require('../models/priceModel');

const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,binancecoin,solana,tether';

const updatePricesInDB = async () => {
  console.log('[CRON JOB DEBUG] Iniciando la tarea de actualización de precios...');
  try {
    const response = await axios.get(COINGECKO_API_URL);
    console.log('[CRON JOB DEBUG] Datos recibidos de CoinGecko con éxito.');
    
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
      console.error("[CRON JOB DEBUG] FALLO: No se recibieron datos válidos de CoinGecko.");
      throw new Error("No se recibieron datos válidos de CoinGecko.");
    }

    console.log('[CRON JOB DEBUG] Guardando los siguientes datos en MongoDB:', fullMarketData);
    await Price.findOneAndUpdate(
      { identifier: 'market-prices' },
      { 
        prices: newPrices,
        fullMarketData: fullMarketData,
        lastUpdated: new Date() 
      },
      { upsert: true, new: true }
    );
    console.log('[CRON JOB DEBUG] ÉXITO: Base de datos de precios actualizada.');
  } catch (error) {
    console.error('[CRON JOB DEBUG] CRÍTICO: Fallo al actualizar los precios en la BD:', error.message);
  }
};

const getPricesFromDB = async () => {
  const priceData = await Price.findOne({ identifier: 'market-prices' });
  
  if (!priceData || !priceData.fullMarketData) {
    console.warn("[PRICE SERVICE] No se encontraron datos de precios en la BD. Devolviendo objeto vacío.");
    return {};
  }
  console.log("[PRICE SERVICE] Datos de precios encontrados en la BD y devueltos al controlador.");
  return priceData.fullMarketData;
};

module.exports = {
  updatePricesInDB,
  getPricesFromDB,
};