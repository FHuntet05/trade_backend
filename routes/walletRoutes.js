// backend/routes/walletRoutes.js (VERSIÓN v17.3.1 - SINCRONIZADO)
const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { protect } = require('../middleware/authMiddleware');

// === RUTAS ACTUALIZADAS ===
// Las funciones createDirectDeposit y createPurchaseInvoice han sido eliminadas y
// su lógica unificada en createDepositInvoice.

router.post('/purchase-with-balance', protect, walletController.purchaseWithBalance);
router.post('/create-deposit-invoice', protect, walletController.createDepositInvoice);
router.post('/start-mining', protect, walletController.startMining);
router.post('/claim', protect, walletController.claim);
router.post('/swap', protect, walletController.swapNtxToUsdt);
router.post('/request-withdrawal', protect, walletController.requestWithdrawal);
router.get('/history', protect, walletController.getHistory);

// El webhook no necesita protección porque se valida con una firma secreta.
router.post('/webhook', walletController.cryptoCloudWebhook);

module.exports = router;