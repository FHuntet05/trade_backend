// RUTA: backend/services/priceService.js

const WebSocket = require('ws');
const axios = require('axios');
const Price = require('../models/priceModel');

// --- Configuración ---
// Se utilizará el endpoint público de KuCoin como proveedor de WebSockets. No requiere API Key para tickers públicos.
const KUCOIN_API_URL = 'https://api.kucoin.com/api/v1/bullet-public';
// Símbolos a los que nos suscribiremos. Deben coincidir con los que usa la aplicación.
const SYMBOLS = ['BTC-USDT', 'ETH-USDT', 'BNB-USDT', 'SOL-USDT'];
const CACHE_STALE_TIMEOUT = 10 * 60 * 1000; // 10 minutos en milisegundos

// --- Estado del Servicio ---
let wss; // Referencia a nuestro servidor WebSocket interno (para los clientes frontend)
let priceCache = new Map(); // Caché en memoria para los últimos precios conocidos
let isProviderConnected = false;
let resilienceTimer = null;

// --- Funciones Internas ---

/**
 * Difunde una actualización de precios a todos los clientes frontend conectados.
 * @param {object} updateData - El objeto con los datos de precios a enviar.
 */
function broadcastToClients(updateData) {
    if (!wss) return;
    const payload = JSON.stringify({ type: 'PRICE_UPDATE', data: updateData });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

/**
 * Maneja los mensajes entrantes del proveedor de WebSockets (KuCoin).
 * @param {string} rawMessage - El mensaje en formato JSON string.
 */
function handleProviderMessage(rawMessage) {
    try {
        const message = JSON.parse(rawMessage);
        if (message.type === 'message' && message.subject === 'trade.ticker') {
            const data = message.data;
            const symbol = message.topic.split(':')[1].split('-')[0]; // Extrae 'BTC' de '/market/ticker:BTC-USDT'
            const price = parseFloat(data.price);

            if (priceCache.get(symbol) !== price) {
                priceCache.set(symbol, price);
                console.log(`[Price Service] Update: ${symbol} = ${price}`);
                broadcastToClients({ [symbol]: price });
                
                // Refrescar el estado de conexión y cancelar el timer de resiliencia si estaba activo
                if (!isProviderConnected) isProviderConnected = true;
                if (resilienceTimer) {
                    clearTimeout(resilienceTimer);
                    resilienceTimer = null;
                    console.log('[Price Service] Conexión con el proveedor reestablecida. Timer de resiliencia cancelado.');
                }
            }
        }
    } catch (error) {
        console.error('[Price Service] Error al procesar mensaje del proveedor:', error);
    }
}

/**
 * Inicia la conexión con el proveedor de WebSockets.
 */
async function connectToProvider() {
    try {
        console.log('[Price Service] Obteniendo token para la conexión WebSocket de KuCoin...');
        const tokenResponse = await axios.post(KUCOIN_API_URL);
        const { token, instanceServers } = tokenResponse.data.data;
        const endpoint = instanceServers[0].endpoint;
        const wsUrl = `${endpoint}?token=${token}`;

        console.log('[Price Service] Conectando al proveedor de WebSocket en:', endpoint);
        const externalWs = new WebSocket(wsUrl);

        externalWs.on('open', () => {
            console.log('[Price Service] Conexión con KuCoin establecida.');
            isProviderConnected = true;
            const subscriptionMessage = {
                id: Date.now(),
                type: 'subscribe',
                topic: `/market/ticker:${SYMBOLS.join(',')}`,
                privateChannel: false,
                response: true
            };
            externalWs.send(JSON.stringify(subscriptionMessage));
            console.log('[Price Service] Mensaje de suscripción enviado a los tickers.');
        });

        externalWs.on('message', handleProviderMessage);

        externalWs.on('close', () => {
            console.warn('[Price Service] La conexión con el proveedor de WebSocket se ha cerrado.');
            isProviderConnected = false;
            // Iniciar lógica de resiliencia y reconexión
            if (!resilienceTimer) {
                console.log(`[Price Service] Iniciando timer de resiliencia de ${CACHE_STALE_TIMEOUT / 60000} minutos.`);
                resilienceTimer = setTimeout(() => {
                    console.error('[Price Service] CRÍTICO: No se pudo reconectar al proveedor. Los datos de precios están desactualizados.');
                    broadcastToClients({ status: 'STALE' });
                }, CACHE_STALE_TIMEOUT);
            }
            // Intentar reconectar después de un breve retraso
            setTimeout(connectToProvider, 5000);
        });

        externalWs.on('error', (error) => {
            console.error('[Price Service] Error en la conexión con el proveedor de WebSocket:', error.message);
        });

    } catch (error) {
        console.error('[Price Service] Fallo al obtener el token de KuCoin. Reintentando en 10 segundos...', error.message);
        setTimeout(connectToProvider, 10000);
    }
}

/**
 * Obtiene los precios iniciales a través de una API REST para poblar la caché al arrancar.
 */
async function populateInitialCache() {
    try {
        console.log('[Price Service] Poblando caché inicial de precios vía API REST...');
        const coingeckoIds = 'bitcoin,ethereum,binancecoin,solana,tether';
        const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoIds}&vs_currencies=usd`);
        const prices = response.data;
        
        priceCache.set('BTC', prices.bitcoin.usd);
        priceCache.set('ETH', prices.ethereum.usd);
        priceCache.set('BNB', prices.binancecoin.usd);
        priceCache.set('SOL', prices.solana.usd);
        priceCache.set('USDT', prices.tether.usd || 1.0);

        console.log('[Price Service] Caché inicial poblada:', Object.fromEntries(priceCache));
    } catch (error) {
        console.error('[Price Service] No se pudo poblar la caché inicial:', error.message);
    }
}


// --- Funciones Exportadas ---

/**
 * Inicializa el servicio de precios, crea el servidor WebSocket interno y se conecta al proveedor.
 * @param {http.Server} server - La instancia del servidor HTTP de Express.
 */
const initializePriceService = async (server) => {
    wss = new WebSocket.Server({ server, path: '/prices' });
    console.log('✅ [Price Service] Servidor WebSocket interno escuchando en /prices');

    wss.on('connection', (ws) => {
        console.log('[Price Service] Un cliente frontend se ha conectado.');
        // Enviar la caché actual al nuevo cliente
        if (priceCache.size > 0) {
            const initialPayload = JSON.stringify({
                type: 'INITIAL_STATE',
                data: Object.fromEntries(priceCache)
            });
            ws.send(initialPayload);
        }
        ws.on('close', () => {
            console.log('[Price Service] Un cliente frontend se ha desconectado.');
        });
    });

    await populateInitialCache();
    await connectToProvider();
};

/**
 * Obtiene el último precio conocido de un ticker desde la caché.
 * @param {string} ticker - El símbolo de la criptomoneda (ej. 'BTC').
 * @returns {number|undefined}
 */
const getPriceFromCache = (ticker) => {
    return priceCache.get(ticker.toUpperCase());
};

module.exports = {
    initializePriceService,
    getPriceFromCache,
};