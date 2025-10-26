// RUTA: backend/routes/cronRoutes.js
// --- VERSIÓN CORREGIDA Y COMPLETA ---

const express = require('express');
const { distributeDailyProfits } = require('../services/profitDistributionService');
const { runBlockchainMonitoringCycle } = require('../services/blockchainWatcherService');
// --- IMPORTACIÓN AÑADIDA ---
const { updatePricesInDB } = require('../services/priceService'); // Se importa la función de actualización de precios

const router = express.Router();

// Middleware de seguridad para proteger las rutas de cron
const protectCron = (req, res, next) => {
    const cronSecret = req.headers['authorization'];
    if (cronSecret === `Bearer ${process.env.CRON_SECRET}`) {
        next();
    } else {
        res.status(401).json({ message: 'No autorizado.' });
    }
};

// @desc    Endpoint para Vercel Cron Job: Distribución de ganancias.
// @route   GET /api/cron/distribute-profits
router.get('/distribute-profits', protectCron, async (req, res) => {
    console.log('[CRON] Iniciando trabajo de distribución de ganancias...');
    try {
        await distributeDailyProfits();
        console.log('[CRON] Trabajo de distribución de ganancias finalizado con éxito.');
        res.status(200).json({ success: true, message: 'Distribución de ganancias completada.' });
    } catch (error) {
        console.error('[CRON] Error en el trabajo de distribución de ganancias:', error);
        res.status(500).json({ success: false, message: 'Falló la distribución de ganancias.' });
    }
});

// @desc    Endpoint para Vercel Cron Job: Monitoreo de la blockchain.
// @route   GET /api/cron/monitor-blockchain
router.get('/monitor-blockchain', protectCron, async (req, res) => {
    console.log('[CRON] Iniciando trabajo de monitoreo de blockchain...');
    try {
        await runBlockchainMonitoringCycle();
        console.log('[CRON] Trabajo de monitoreo de blockchain finalizado con éxito.');
        res.status(200).json({ success: true, message: 'Monitoreo de blockchain completado.' });
    } catch (error) {
        console.error('[CRON] Error en el trabajo de monitoreo de blockchain:', error);
        res.status(500).json({ success: false, message: 'Falló el monitoreo de blockchain.' });
    }
});

// --- RUTA AÑADIDA Y CORREGIDA ---
// @desc    Endpoint para Vercel Cron Job: Actualiza los precios de mercado en la BD.
// @route   GET /api/cron/update-prices
router.get('/update-prices', protectCron, async (req, res) => {
    console.log('[CRON] Iniciando trabajo de actualización de precios...');
    try {
        await updatePricesInDB();
        console.log('[CRON] Trabajo de actualización de precios finalizado con éxito.');
        res.status(200).json({ success: true, message: 'Actualización de precios completada.' });
    } catch (error) {
        console.error('[CRON] Error en el trabajo de actualización de precios:', error);
        res.status(500).json({ success: false, message: 'Falló la actualización de precios.' });
    }
});


module.exports = router;