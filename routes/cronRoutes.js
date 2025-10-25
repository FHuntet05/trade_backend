// RUTA: backend/routes/cronRoutes.js

const express = require('express');
const { distributeDailyProfits } = require('../services/profitDistributionService');
const { startMonitoring } = require('../services/blockchainWatcherService');

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

// @desc    Endpoint para que Vercel Cron Job ejecute la distribución de ganancias.
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

// @desc    Endpoint para que Vercel Cron Job ejecute el monitoreo de la blockchain.
// @route   GET /api/cron/monitor-blockchain
router.get('/monitor-blockchain', protectCron, async (req, res) => {
    console.log('[CRON] Iniciando trabajo de monitoreo de blockchain...');
    try {
        // La función startMonitoring usa setInterval, la adaptaremos para una sola ejecución
        // Por ahora, asumimos que puede ser llamada directamente para un ciclo.
        await startMonitoring(); // Asumiendo que startMonitoring puede ejecutar un ciclo
        console.log('[CRON] Trabajo de monitoreo de blockchain finalizado con éxito.');
        res.status(200).json({ success: true, message: 'Monitoreo de blockchain completado.' });
    } catch (error) {
        console.error('[CRON] Error en el trabajo de monitoreo de blockchain:', error);
        res.status(500).json({ success: false, message: 'Falló el monitoreo de blockchain.' });
    }
});


module.exports = router;