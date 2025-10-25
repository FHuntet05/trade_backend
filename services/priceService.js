// RUTA: backend/services/priceService.js
// --- INICIO DE LA REFACTORIZACIÓN COMPLETA A ON-DEMAND ---

const axios = require('axios');

// URL y mapeo de IDs para la API de CoinGecko.
const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,binancecoin,solana,tether&vs_currencies=usd';
const SYMBOL_MAP = {
  'bitcoin': 'BTC',
  'ethereum': 'ETH',
  'binancecoin': 'BNB',
  'solana': 'SOL',
  'tether': 'USDT'
};

/**
 * Obtiene los precios de las criptomonedas directamente desde la API de CoinGecko.
 * Esta función es "on-demand" y no depende de ninguna caché interna.
 * @returns {Promise<object>} Un objeto con los precios en el formato esperado por el frontend.
 * @throws {Error} Lanza un error si la API externa falla.
 */
const getPricesOnDemand = async () => {
  console.log('[Price Service] Solicitando precios actualizados a CoinGecko...');
  try {
    const response = await axios.get(COINGECKO_API_URL);
    const externalData = response.data;
    
    // Transforma la respuesta al formato interno de la aplicación.
    const formattedPrices = {};
    for (const key in externalData) {
      if (SYMBOL_MAP[key]) {
        const symbol = SYMBOL_MAP[key];
        formattedPrices[symbol] = externalData[key].usd;
      }
    }

    console.log('[Price Service] Precios obtenidos y transformados:', formattedPrices);
    return formattedPrices;

  } catch (error) {
    console.error('[Price Service] CRÍTICO: Fallo al obtener precios de CoinGecko:', error.message);
    // Se lanza un error específico que el controlador puede capturar.
    throw new Error('El servicio de precios externos no está disponible en este momento.');
  }
};

module.exports = {
  getPricesOnDemand,
};

// --- FIN DE LA REFACTORIZACIÓN COMPLETA A ON-DEMAND ---