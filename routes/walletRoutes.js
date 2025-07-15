// backend/routes/walletRoutes.js (COMPLETO Y CORREGIDO)
const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { protect } = require('../middleware/authMiddleware'); // <-- Usamos protect

router.post('/create-direct-deposit', protect, walletController.createDirectDeposit);
router.post('/purchase-with-balance', protect, walletController.purchaseWithBalance);
router.post('/create-purchase-invoice', protect, walletController.createPurchaseInvoice);
router.post('/create-deposit-invoice', protect, walletController.createDepositInvoice);
router.post('/start-mining', protect, walletController.startMining);
router.post('/claim', protect, walletController.claim);
router.post('/swap', protect, walletController.swap);
router.post('/request-withdrawal', protect, walletController.requestWithdrawal);
router.get('/history', protect, walletController.getHistory);
router.post('/webhook', walletController.cryptoCloudWebhook);

module.exports = router;