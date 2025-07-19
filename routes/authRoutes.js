// backend/routes/authRoutes.js (VERSIÓN TRASPLANTE v25.0)
const express = require('express');
const router = express.Router();
const { syncUser, getUserProfile, loginAdmin } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Ruta única y simple para la sincronización.
router.post('/sync', syncUser);

router.get('/profile', protect, getUserProfile);
router.post('/login/admin', loginAdmin);

module.exports = router;