// backend/routes/walletRoutes.js

const express = require('express');
const router = express.Router();

const { 
  createDirectDeposit,
  createPurchaseInvoice,
  purchaseWithBalance,
  createDepositInvoice,
  cryptoCloudWebhook, 
  claimMiningRewards,
  claimTaskReward, // <-- IMPORTAMOS LA NUEVA FUNCIÓN
  swapNtxToUsdt,
  requestWithdrawal,
  getHistory,
} = require('../controllers/walletController');

const authMiddleware = require('../middleware/authMiddleware');

// --- RUTAS PROTEGIDAS (REQUIEREN AUTENTICACIÓN) ---

router.post('/create-direct-deposit', authMiddleware, createDirectDeposit);
router.post('/create-purchase-invoice', authMiddleware, createPurchaseInvoice);
router.post('/purchase-with-balance', authMiddleware, purchaseWithBalance);
router.post('/create-deposit-invoice', authMiddleware, createDepositInvoice);

// Acciones del usuario
router.post('/claim', authMiddleware, claimMiningRewards); // Para la minería principal
router.post('/tasks/claim', authMiddleware, claimTaskReward); // <-- NUEVA RUTA PARA TAREAS
router.post('/swap', authMiddleware, swapNtxToUsdt);
router.post('/request-withdrawal', authMiddleware, requestWithdrawal);

router.get('/history', authMiddleware, getHistory);

// --- RUTA PÚBLICA PARA EL WEBHOOK ---
router.post('/webhook', express.json(), cryptoCloudWebhook);

module.exports = router;