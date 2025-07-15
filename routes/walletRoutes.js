// backend/routes/walletRoutes.js (CORREGIDO Y FUNCIONAL)
const express = require('express');
const router = express.Router();

// CAMBIO 1: Importamos el objeto completo de controladores. Esto está bien.
const walletController = require('../controllers/walletController');
const { protect } = require('../middleware/authMiddleware');

// CAMBIO 2: Aplicamos el middleware 'protect' a cada ruta que lo necesita. Correcto.
router.post('/create-direct-deposit', protect, walletController.createDirectDeposit);
router.post('/purchase-with-balance', protect, walletController.purchaseWithBalance);
router.post('/create-purchase-invoice', protect, walletController.createPurchaseInvoice);
router.post('/create-deposit-invoice', protect, walletController.createDepositInvoice);
router.post('/start-mining', protect, walletController.startMining);
router.post('/claim', protect, walletController.claim);

// --- LA CORRECCIÓN CLAVE ---
// La función se llama 'swapNtxToUsdt', no 'swap'.
router.post('/swap', protect, walletController.swapNtxToUsdt);

router.post('/request-withdrawal', protect, walletController.requestWithdrawal);
router.get('/history', protect, walletController.getHistory);

// El webhook no necesita protección porque se autentica con una firma.
router.post('/webhook', walletController.cryptoCloudWebhook);

module.exports = router;