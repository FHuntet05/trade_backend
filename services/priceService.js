// backend/services/priceService.js
const axios = require('axios');

// IDs de CoinGecko para las monedas que nos interesan.
const COINGECKO_IDS = 'binancecoin,tron'; // USDT es nuestro 'stable', no necesitamos su precio en USD.
const API_URL = `https://api.coingecko.com/api/v3/simple/price?ids=${COINGECKO_IDS}&vs_currencies=usd`;

// Usamos un Map como caché en memoria para los precios.
const priceCache = new Map();

/**
 * Obtiene los precios más recientes de la API de CoinGecko y actualiza la caché.
 */
const updatePrices = async () => {
    try {
        console.log('🔄 Actualizando precios de criptomonedas desde CoinGecko...');
        const response = await axios.get(API_URL);
        const prices = response.data;

        // Mapeamos los IDs de CoinGecko a nuestros tickers internos.
        if (prices.binancecoin?.usd) {
            priceCache.set('BNB', prices.binancecoin.usd);
        }
        if (prices.tron?.usd) {
            priceCache.set('TRX', prices.tron.usd);
        }
        // USDT siempre vale 1 USD.
        priceCache.set('USDT', 1);

        console.log('✅ Precios actualizados:', Array.from(priceCache.entries()));

    } catch (error) {
        console.error('❌ Error al actualizar los precios desde CoinGecko:', error.message);
        // No borramos la caché si la API falla, para seguir operando con los últimos precios conocidos.
    }
};

/**
 * Inicia el servicio de precios: hace una llamada inicial y luego establece un intervalo de actualización.
 */
const startPriceService = () => {
    // 1. Ejecutar inmediatamente al arrancar el servidor.
    updatePrices();

    // 2. Establecer un intervalo para actualizar cada 12 horas.
    // 12 horas * 60 minutos/hora * 60 segundos/minuto * 1000 ms/segundo
    const TWELVE_HOURS_IN_MS = 12 * 60 * 60 * 1000;
    setInterval(updatePrices, TWELVE_HOURS_IN_MS);
};

/**
 * Devuelve el precio de una moneda desde la caché.
 * @param {string} ticker - El ticker de la moneda (ej. 'BNB', 'TRX').
 * @returns {number | undefined} El precio en USD o undefined si no se encuentra.
 */
const getPrice = (ticker) => {
    return priceCache.get(ticker);
};

module.exports = {
    startPriceService,
    getPrice,
};