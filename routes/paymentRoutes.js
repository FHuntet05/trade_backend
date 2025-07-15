const express = require('express');
const router = express.Router();
const { generateAddress, getPrices } = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware');

router.post('/generate-address', protect, generateAddress);
router.get('/prices', protect, getPrices);

module.exports = router;