const express = require('express');
const router = express.Router();
const { getTaskStatus, claimTaskReward } = require('../controllers/taskController');
const { protect } = require('../middleware/authMiddleware');

router.get('/status', protect, getTaskStatus);
router.post('/claim', protect, claimTaskReward);

module.exports = router;