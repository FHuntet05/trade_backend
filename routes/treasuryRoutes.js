// backend/routes/treasuryRoutes.js (VERSIÓN v17.7 - SIMPLIFICADA)
const express = require('express');
const router = express.Router();
const { getHotWalletBalances, sweepWallet, getSweepableWallets } = require('../controllers/treasuryController');
const { protect, isAdmin } = require('../middleware/authMiddleware');

router.get('/hot-balances', protect, isAdmin, getHotWalletBalances);
router.post('/sweep', protect, isAdmin, sweepWallet);
router.get('/sweepable-wallets', protect, isAdmin, getSweepableWallets);

module.exports = router;