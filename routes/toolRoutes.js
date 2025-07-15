const express = require('express');
const router = express.Router();
const { getTools, purchaseWithBalance } = require('../controllers/toolController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getTools);
router.post('/purchase-with-balance', protect, purchaseWithBalance);

module.exports = router;