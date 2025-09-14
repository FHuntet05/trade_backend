// backend/services/blockchainService.js (FASE "FORTITUDO" - SERVICIO RPC CENTRALIZADO CON CACHÉ)
const { ethers } = require('ethers');
const axios = require('axios');
const NodeCache = require('node-cache');

const RPC_URL = process.env.ANKR_RPC_URL;
if (!RPC_URL) throw new Error("La variable de entorno ANKR_RPC_URL no está definida.");

// [CENTRALIZACIÓN] - ÚNICA INSTANCIA DEL PROVEEDOR RPC
const provider = new ethers.JsonRpcProvider(RPC_URL, undefined, { staticNetwork: true });
console.log(`[BlockchainService] Conectado al RPC en: ${RPC_URL}`.cyan);

// [CACHÉ] - ÚNICA INSTANCIA DE CACHÉ
const cache = new NodeCache({ stdTTL: 15, checkperiod: 30, useClones: false });
console.log('[BlockchainService] Capa de caché inicializada.'.cyan);

/**
 * [CACHÉ] - Wrapper inteligente para peticiones HTTP (Axios) a exploradores de bloques.
 * Cachea la respuesta de una URL por un tiempo determinado.
 * @param {string} url La URL a la que se hará la petición GET.
 * @param {number} ttl Segundos que la respuesta permanecerá en caché.
 * @returns {Promise<object>} La data de la respuesta de Axios.
 */
const makeCachedRequest = async (url, ttl = 10) => {
    const cachedResponse = cache.get(url);
    if (cachedResponse) {
        console.log(`[Cache] HIT: para URL ${url.substring(0, 80)}...`);
        return cachedResponse;
    }

    console.log(`[HTTP] CALL: para URL ${url.substring(0, 80)}...`);
    const response = await axios.get(url, { timeout: 15000 });
    if (response.data) {
        cache.set(url, response.data, ttl);
    }
    return response.data;
};

/**
 * Obtiene el balance de la moneda nativa (BNB) de una wallet.
 * @param {string} address La dirección de la wallet a consultar.
 * @returns {Promise<bigint>} El balance en formato BigInt.
 */
const getBnbBalance = async (address) => {
    const cacheKey = `balance_bnb_${address}`;
    const cachedBalance = cache.get(cacheKey);
    if (cachedBalance) return BigInt(cachedBalance);

    const balance = await provider.getBalance(address);
    cache.set(cacheKey, balance.toString());
    return balance;
};

module.exports = {
    provider, // Exportamos la instancia única del proveedor
    cache,    // Exportamos la caché para usos avanzados si es necesario
    makeCachedRequest,
    getBnbBalance,
};