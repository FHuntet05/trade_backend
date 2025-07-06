// backend/routes/taskRoutes.js
const express = require('express');
const router = express.Router();
const { getTaskStatus, claimTaskReward } = require('../controllers/taskController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/status', getTaskStatus);
router.post('/claim', claimTaskReward);

module.exports = router;