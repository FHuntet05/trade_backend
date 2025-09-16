// RUTA: backend/routes/walletRoutes.js (VERSIÓN "NEXUS - SETTINGS AWARE")
const express = require('express');
const router = express.Router();

// [NEXUS SETTINGS AWARE] Importamos solo las funciones que existen en el controlador refactorizado.
const {
    startMining,
    claim,
    swapNtxToUsdt,
    requestWithdrawal,
    getHistory
} = require('../controllers/walletController');
const { protect } = require('../middleware/authMiddleware');

// === RUTAS SINCRONIZADAS Y LIMPIAS ===
// Se eliminan las rutas obsoletas:
// - /purchase-with-balance (esta lógica pertenece a toolRoutes, no aquí)
// - /create-deposit-invoice (lógica de CryptoCloud eliminada)
// - /webhook (lógica de CryptoCloud eliminada)

router.post('/start-mining', protect, startMining);
router.post('/claim', protect, claim);
router.post('/swap', protect, swapNtxToUsdt);
router.post('/request-withdrawal', protect, requestWithdrawal);
router.get('/history', protect, getHistory);

module.exports = router;