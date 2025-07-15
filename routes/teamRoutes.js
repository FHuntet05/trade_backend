const express = require('express');
const router = express.Router();
const { getTeamStats, getLevelDetails } = require('../controllers/teamController');
const { protect } = require('../middleware/authMiddleware');

router.get('/stats', protect, getTeamStats);
router.get('/level-details/:level', protect, getLevelDetails);

module.exports = router;