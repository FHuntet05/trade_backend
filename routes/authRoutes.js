// backend/routes/authRoutes.js (CÓDIGO FINAL)
const express = require('express');
const router = express.Router();
const { syncUser, getUserProfile, loginAdmin } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/sync', syncUser);
router.get('/profile', protect, getUserProfile);
router.post('/login/admin', loginAdmin);

module.exports = router;