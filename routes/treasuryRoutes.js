// backend/routes/treasuryRoutes.js (VERSIÓN FINAL)
const express = require('express');
const router = express.Router();
const { 
    getHotWalletBalances, 
    sweepWallet, 
    getSweepableWallets // Nuestra nueva función
} = require('../controllers/treasuryController');

const { protect, admin } = require('../middleware/authMiddleware');

// Todas las rutas aquí están bajo /api/treasury
// y son solo para administradores.

router.route('/hot-balances').get(protect, admin, getHotWalletBalances);
router.route('/sweep').post(protect, admin, sweepWallet);
router.route('/sweepable-wallets').get(protect, admin, getSweepableWallets);

module.exports = router;