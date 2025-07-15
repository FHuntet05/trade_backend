const express = require('express');
const router = express.Router();
const { authTelegramUser, getUserProfile, loginAdmin } = require('../controllers/authController');
const { verifyLoginToken } = require('../controllers/twoFactorAuthController');
const { protect } = require('../middleware/authMiddleware');

router.post('/login', authTelegramUser);
router.get('/profile', protect, getUserProfile);
router.post('/login/admin', loginAdmin);
router.post('/2fa/verify-login', verifyLoginToken);

module.exports = router;