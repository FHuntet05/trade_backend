// backend/routes/walletRoutes.js
const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.post('/create-direct-deposit', authMiddleware, walletController.createDirectDeposit);
router.post('/purchase-with-balance', authMiddleware, walletController.purchaseWithBalance);
router.post('/create-purchase-invoice', authMiddleware, walletController.createPurchaseInvoice);
router.post('/create-deposit-invoice', authMiddleware, walletController.createDepositInvoice);
router.post('/start-mining', authMiddleware, walletController.startMining);
router.post('/claim', authMiddleware, walletController.claim);
router.post('/swap', authMiddleware, walletController.swapNtxToUsdt);
router.post('/request-withdrawal', authMiddleware, walletController.requestWithdrawal);
router.get('/history', authMiddleware, walletController.getHistory);
router.post('/claim-task', authMiddleware, walletController.claimTaskReward);
router.post('/webhook', walletController.cryptoCloudWebhook);

module.exports = router;