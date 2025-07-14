// backend/services/priceService.js (VERSIÓN ROBUSTA CON REINTENTOS)
const axios = require('axios');

const COINGECKO_IDS = 'binancecoin,tron';
const API_URL = `https://api.coingecko.com/api/v3/simple/price?ids=${COINGECKO_IDS}&vs_currencies=usd`;
const priceCache = new Map();

// Función auxiliar para esperar un tiempo
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Obtiene los precios más recientes, con una lógica de reintentos.
 */
const updatePrices = async (retries = 3) => {
    try {
        console.log(`🔄 Actualizando precios... (Intentos restantes: ${retries})`);
        const response = await axios.get(API_URL);
        const prices = response.data;

        if (prices.binancecoin?.usd) priceCache.set('BNB', prices.binancecoin.usd);
        if (prices.tron?.usd) priceCache.set('TRX', prices.tron.usd);
        priceCache.set('USDT', 1);

        console.log('✅ Precios actualizados:', Array.from(priceCache.entries()));
        return true; // Éxito
    } catch (error) {
        console.error(`❌ Error al actualizar precios: ${error.message}`);
        if (retries > 0) {
            console.log('Esperando 2 segundos para reintentar...');
            await sleep(2000);
            return updatePrices(retries - 1); // Llamada recursiva con un intento menos
        } else {
            console.error('!!! FALLO CRÍTICO: No se pudieron obtener los precios después de varios intentos.');
            return false; // Fallo definitivo
        }
    }
};

/**
 * Inicia el servicio: hace una llamada inicial y luego establece el intervalo.
 * Devuelve la promesa de la primera actualización.
 */
const startPriceService = () => {
    // Establecer el intervalo de actualización para futuras ejecuciones (cada 12 horas)
    const TWELVE_HOURS_IN_MS = 12 * 60 * 60 * 1000;
    setInterval(updatePrices, TWELVE_HOURS_IN_MS);
    
    // Devolver la promesa de la primera ejecución para que el servidor pueda esperarla.
    return updatePrices();
};

const getPrice = (ticker) => priceCache.get(ticker);

module.exports = { startPriceService, getPrice };