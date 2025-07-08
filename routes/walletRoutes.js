const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { authMiddleware } = require('../middleware/authMiddleware');

// --- Rutas de compra y depósito ---
router.post('/create-direct-deposit', authMiddleware, walletController.createDirectDeposit);
router.post('/purchase-with-balance', authMiddleware, walletController.purchaseWithBalance);
router.post('/create-purchase-invoice', authMiddleware, walletController.createPurchaseInvoice);
router.post('/create-deposit-invoice', authMiddleware, walletController.createDepositInvoice);

// --- NUEVA RUTA: Para el botón "Iniciar" ---
router.post('/start-mining', authMiddleware, walletController.startMining);

// --- RUTA DE RECLAMO: Asegurarse de que apunte a la función 'claim' ---
router.post('/claim', authMiddleware, walletController.claim);

// --- Otras rutas de la billetera ---
router.post('/swap', authMiddleware, walletController.swapNtxToUsdt);
router.post('/request-withdrawal', authMiddleware, walletController.requestWithdrawal);
router.get('/history', authMiddleware, walletController.getHistory);
router.post('/claim-task', authMiddleware, walletController.claimTaskReward);

// --- Webhook (no necesita authMiddleware) ---
router.post('/webhook', walletController.cryptoCloudWebhook);


module.exports = router;