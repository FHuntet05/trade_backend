// RUTA: backend/services/priceService.js
// --- REFACTORIZADO PARA OBTENER PRECIO Y CAMBIO PORCENTUAL ---

const axios = require('axios');

// Se cambia al endpoint 'coins/markets' que es más completo.
const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,binancecoin,solana,tether';

// Mapeo de IDs a Símbolos para la transformación.
const SYMBOL_MAP = {
  'bitcoin': 'BTC',
  'ethereum': 'ETH',
  'binancecoin': 'BNB',
  'solana': 'SOL',
  'tether': 'USDT'
};

/**
 * Obtiene datos de mercado (precio, cambio 24h, etc.) desde CoinGecko.
 * @returns {Promise<object>} Un objeto con los datos enriquecidos.
 */
const getMarketDataOnDemand = async () => {
  console.log('[Price Service] Solicitando datos de mercado completos a CoinGecko...');
  try {
    const response = await axios.get(COINGECKO_API_URL);
    const externalData = response.data; // Esto es un array de objetos
    
    const formattedData = {};
    for (const coin of externalData) {
      const symbol = SYMBOL_MAP[coin.id];
      if (symbol) {
        formattedData[symbol] = {
          name: coin.name,
          symbol: symbol,
          price: coin.current_price,
          change: coin.price_change_percentage_24h,
          image: coin.image // Incluimos la URL de la imagen para el frontend
        };
      }
    }

    console.log('[Price Service] Datos de mercado obtenidos y transformados.');
    return formattedData;

  } catch (error) {
    console.error('[Price Service] CRÍTICO: Fallo al obtener datos de mercado:', error.message);
    throw new Error('El servicio de precios externos no está disponible.');
  }
};

module.exports = {
  getMarketDataOnDemand,
};