// backend/services/priceService.js (VERSIÓN FINAL CON MONGODB)
const axios = require('axios');
const Price = require('../models/priceModel'); // <<< 1. Importar el nuevo modelo

const COINGECKO_IDS = 'binancecoin,tron';
const API_URL = `https://api.coingecko.com/api/v3/simple/price?ids=${COINGECKO_IDS}&vs_currencies=usd`;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const updatePrices = async (retries = 3) => {
    try {
        console.log(`🔄 Actualizando precios desde CoinGecko... (Intentos restantes: ${retries})`);
        const response = await axios.get(API_URL);
        const prices = response.data;
        
        // <<< 2. Lógica para guardar en MongoDB
        const operations = [];
        if (prices.binancecoin?.usd) {
            operations.push({
                updateOne: {
                    filter: { ticker: 'BNB' },
                    update: { $set: { priceUsd: prices.binancecoin.usd } },
                    upsert: true // Crea el documento si no existe
                }
            });
        }
        if (prices.tron?.usd) {
            operations.push({
                updateOne: {
                    filter: { ticker: 'TRX' },
                    update: { $set: { priceUsd: prices.tron.usd } },
                    upsert: true
                }
            });
        }
        operations.push({
            updateOne: {
                filter: { ticker: 'USDT' },
                update: { $set: { priceUsd: 1 } },
                upsert: true
            }
        });

        // Ejecutamos todas las operaciones de una vez para ser más eficientes.
        await Price.bulkWrite(operations);
        console.log('✅ Precios guardados/actualizados en MongoDB.');
        return true;

    } catch (error) {
        console.error(`❌ Error al actualizar precios: ${error.message}`);
        if (retries > 0) {
            await sleep(2000);
            return updatePrices(retries - 1);
        } else {
            console.error('!!! FALLO CRÍTICO: No se pudieron obtener los precios después de varios intentos.');
            // Verificamos si hay precios antiguos en la DB como fallback.
            const oldPricesCount = await Price.countDocuments();
            return oldPricesCount > 0; // Si hay precios viejos, el servidor puede arrancar.
        }
    }
};

const startPriceService = () => {
    const TWELVE_HOURS_IN_MS = 12 * 60 * 60 * 1000;
    setInterval(updatePrices, TWELVE_HOURS_IN_MS);
    return updatePrices();
};

// <<< 3. La función getPrice ahora lee de la base de datos
const getPrice = async (ticker) => {
    try {
        const priceDoc = await Price.findOne({ ticker: ticker.toUpperCase() });
        return priceDoc ? priceDoc.priceUsd : undefined;
    } catch (error) {
        console.error(`Error al obtener precio para ${ticker} de la DB:`, error);
        return undefined;
    }
};

module.exports = { startPriceService, getPrice };