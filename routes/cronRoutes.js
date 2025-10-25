// RUTA: backend/routes/cronRoutes.js

const express = require('express');
const { distributeDailyProfits } = require('../services/profitDistributionService');
// --- INICIO DE LA CORRECCIÓN CRÍTICA ---
// Se importa la nueva función 'runBlockchainMonitoringCycle' en lugar de 'startMonitoring'.
const { runBlockchainMonitoringCycle } = require('../services/blockchainWatcherService');
// --- FIN DE LA CORRECCIÓN CRÍTICA ---

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
        // --- INICIO DE LA CORRECCIÓN CRÍTICA ---
        // Se llama a la nueva función que ejecuta un solo ciclo y termina.
        // Esto permite que la función serverless complete su ejecución y evita el crash.
        await runBlockchainMonitoringCycle();
        // --- FIN DE LA CORRECCIÓN CRÍTICA ---
        console.log('[CRON] Trabajo de monitoreo de blockchain finalizado con éxito.');
        res.status(200).json({ success: true, message: 'Monitoreo de blockchain completado.' });
    } catch (error) {
        console.error('[CRON] Error en el trabajo de monitoreo de blockchain:', error);
        res.status(500).json({ success: false, message: 'Falló el monitoreo de blockchain.' });
    }
});


module.exports = router;