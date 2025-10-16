// RUTA: backend/services/priceService.js

const axios = require('axios');
const Price = require('../models/priceModel');

const COINGECKO_IDS = 'bitcoin,ethereum,binancecoin,solana,tether';
const API_URL = `https://api.coingecko.com/api/v3/simple/price?ids=${COINGECKO_IDS}&vs_currencies=usd`;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const updatePrices = async (retries = 3) => {
    try {
        console.log(`[Price Service] Updating prices from CoinGecko... (Retries left: ${retries})`);
        const response = await axios.get(API_URL);
        const prices = response.data;
        
        const operations = [
            { ticker: 'BTC', price: prices.bitcoin?.usd },
            { ticker: 'ETH', price: prices.ethereum?.usd },
            { ticker: 'BNB', price: prices.binancecoin?.usd },
            { ticker: 'SOL', price: prices.solana?.usd },
            { ticker: 'USDT', price: prices.tether?.usd || 1.0 }
        ]
        .filter(p => p.price !== undefined)
        .map(({ ticker, price }) => ({
            updateOne: {
                filter: { ticker },
                update: { $set: { priceUsd: price } },
                upsert: true
            }
        }));

        if (operations.length > 0) {
            await Price.bulkWrite(operations);
            console.log('[Price Service] Prices successfully saved/updated in MongoDB.');
        } else {
            console.warn('[Price Service] No prices were updated from the API response.');
        }
        
        return true;

    } catch (error) {
        console.error(`[Price Service] Error updating prices: ${error.message}`);
        if (retries > 0) {
            await sleep(3000);
            return updatePrices(retries - 1);
        } else {
            console.error('[Price Service] CRITICAL FAILURE: Could not fetch prices after multiple retries.');
            const oldPricesCount = await Price.countDocuments();
            return oldPricesCount > 0;
        }
    }
};

const startPriceService = () => {
    const TWELVE_HOURS_IN_MS = 12 * 60 * 60 * 1000;
    setInterval(updatePrices, TWELVE_HOURS_IN_MS);
    return updatePrices();
};

const getPrice = async (ticker) => {
    try {
        const priceDoc = await Price.findOne({ ticker: ticker.toUpperCase() });
        return priceDoc ? priceDoc.priceUsd : undefined;
    } catch (error) {
        console.error(`[Price Service] Error getting price for ${ticker} from DB:`, error);
        return undefined;
    }
};

module.exports = { startPriceService, getPrice, updatePrices };