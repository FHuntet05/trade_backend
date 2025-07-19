const express = require('express');
const router = express.Router();
const { syncUser } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/api/auth/sync', protect, syncUser);

module.exports = router;