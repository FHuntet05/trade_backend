// backend/routes/walletRoutes.js (VERSIÓN FINAL COMPLETA Y REVISADA)

const express = require('express');
const router = express.Router();

const { 
  createPurchaseInvoice,
  purchaseWithBalance,
  createDepositInvoice,
  cryptoCloudWebhook, 
  claimMiningRewards,
  swapNtxToUsdt,
  requestWithdrawal,
  getHistory,
} = require('../controllers/walletController');

const authMiddleware = require('../middleware/authMiddleware');

// --- RUTAS PROTEGIDAS (REQUIEREN AUTENTICACIÓN) ---
// Compras y Transacciones
router.post('/create-purchase-invoice', authMiddleware, createPurchaseInvoice);
router.post('/purchase-with-balance', authMiddleware, purchaseWithBalance);
router.post('/create-deposit-invoice', authMiddleware, createDepositInvoice);

// Acciones del usuario
router.post('/claim', authMiddleware, claimMiningRewards); 
router.post('/swap', authMiddleware, swapNtxToUsdt);
router.post('/request-withdrawal', authMiddleware, requestWithdrawal);

// Historial
router.get('/history', authMiddleware, getHistory);


// --- RUTA PÚBLICA PARA EL WEBHOOK (NO REQUIERE AUTENTICACIÓN) ---
// Es pública porque es llamada por un servicio externo (CryptoCloud)
router.post('/webhook', express.json(), cryptoCloudWebhook);

module.exports = router;