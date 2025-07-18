// backend/routes/taskRoutes.js
const express = require('express');
const { protect } = require('../middleware/authMiddleware.js');
const { getTaskStatus, claimTaskReward, markTaskAsVisited } = require('../controllers/taskController.js');

const router = express.Router();

// Rutas existentes
router.get('/status', protect, getTaskStatus);
router.post('/claim', protect, claimTaskReward);

// === NUEVA RUTA CRÍTICA (SINTAXIS COMMONJS) ===
router.post('/mark-as-visited', protect, markTaskAsVisited);

module.exports = router;