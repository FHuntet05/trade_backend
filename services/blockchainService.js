// RUTA: backend/services/blockchainService.js (VERSIÓN "NEXUS - RPC UPGRADE & SYNTAX FIX")
const { ethers } = require('ethers');
const axios = require('axios');
const NodeCache = require('node-cache');
const colors = require('colors'); // Importamos colors para logs más claros.

const RPC_URL = process.env.ANKR_RPC_URL;
if (!RPC_URL) {
    throw new Error("CRITICAL: La variable de entorno ANKR_RPC_URL no está definida.");
}

// [NEXUS RPC UPGRADE] - CORRECCIÓN CRÍTICA DE SINTAXIS
// La sintaxis correcta para instanciar un proveedor en Ethers v5 es a través del namespace 'providers'.
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
console.log(`[BlockchainService] Conectado al proveedor RPC en: ${RPC_URL}`.cyan);

// [CACHÉ] - Instancia única de caché para optimizar peticiones repetitivas.
const cache = new NodeCache({ stdTTL: 15, checkperiod: 30, useClones: false });
console.log('[BlockchainService] Capa de caché para peticiones HTTP inicializada.'.cyan);

/**
 * Wrapper para peticiones HTTP (Axios) que cachea la respuesta por un tiempo determinado.
 * @param {string} url La URL a la que se hará la petición GET.
 * @param {number} ttl Segundos que la respuesta permanecerá en caché.
 * @returns {Promise<object>} La data de la respuesta de Axios.
 */
const makeCachedRequest = async (url, ttl = 10) => {
    const cachedResponse = cache.get(url);
    if (cachedResponse) {
        // console.log(`[Cache] HIT: para URL ${url.substring(0, 80)}...`);
        return cachedResponse;
    }

    // console.log(`[HTTP] CALL: para URL ${url.substring(0, 80)}...`);
    try {
        const response = await axios.get(url, { timeout: 15000 });
        if (response.data) {
            cache.set(url, response.data, ttl);
        }
        return response.data;
    } catch (error) {
        console.error(`[HTTP] Error en la petición a ${url}:`, error.message);
        throw error; // Relanzamos el error para que el llamador lo maneje.
    }
};

/**
 * Obtiene el balance de la moneda nativa (BNB) de una wallet.
 * @param {string} address La dirección de la wallet a consultar.
 * @returns {Promise<ethers.BigNumber>} El balance en formato BigNumber de Ethers v5.
 */
const getBnbBalance = async (address) => {
    const cacheKey = `balance_bnb_${address}`;
    const cachedBalance = cache.get(cacheKey);
    if (cachedBalance) {
        return ethers.BigNumber.from(cachedBalance);
    }

    const balance = await provider.getBalance(address);
    cache.set(cacheKey, balance.toString(), 60); // Cacheamos el balance por 60 segundos.
    return balance;
};

module.exports = {
    provider, // Exportamos la instancia única del proveedor para ser usada en todo el sistema.
    cache,
    makeCachedRequest,
    getBnbBalance,
};