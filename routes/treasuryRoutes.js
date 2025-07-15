// backend/routes/treasuryRoutes.js (VERSIÓN 100% CORREGIDA)
const express = require('express');
const router = express.Router();
const { 
    getHotWalletBalances, 
    sweepWallet, 
    getSweepableWallets
} = require('../controllers/treasuryController');

// Importación correcta con desestructuración y el nombre correcto de la función
const { protect, isAdmin } = require('../middleware/authMiddleware');

// Usamos `isAdmin`, que es el nombre correcto de la función
router.route('/hot-balances').get(protect, isAdmin, getHotWalletBalances);
router.route('/sweep').post(protect, isAdmin, sweepWallet);
router.route('/sweepable-wallets').get(protect, isAdmin, getSweepableWallets);

module.exports = router;