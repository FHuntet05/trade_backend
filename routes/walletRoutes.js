// RUTA: backend/routes/walletRoutes.js (VERSIÓN "NEXUS - UNIFIED TRANSACTION SOURCE")
const express = require('express');
const router = express.Router();

// [NEXUS UNIFICATION] - INICIO DE LA MODIFICACIÓN DE IMPORTS
// Se importa 'getUserTransactions' desde el controlador de usuario.
const { getUserTransactions } = require('../controllers/userController'); 

// Se importa todo desde walletController EXCEPTO la función obsoleta 'getHistory'.
const {
    startMining,
    claim,
    swapNtxToUsdt,
    requestWithdrawal,
} = require('../controllers/walletController');
const { protect } = require('../middleware/authMiddleware');
// [NEXUS UNIFICATION] - FIN DE LA MODIFICACIÓN DE IMPORTS


router.post('/start-mining', protect, startMining);
router.post('/claim', protect, claim);
router.post('/swap', protect, swapNtxToUsdt);
router.post('/request-withdrawal', protect, requestWithdrawal);

// [NEXUS UNIFICATION] - INICIO DE LA MODIFICACIÓN DE RUTA
// La ruta de historial ahora apunta a la nueva función centralizada y correcta.
router.get('/history', protect, getUserTransactions);
// [NEXUS UNIFICATION] - FIN DE LA MODIFICACIÓN DE RUTA

module.exports = router;