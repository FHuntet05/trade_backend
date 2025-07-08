// backend/routes/teamRoutes.js (CORREGIDO)
const express = require('express');
const router = express.Router();
const { getTeamStats, getLevelDetails } = require('../controllers/teamController');
// --- LA CORRECCIÓN CLAVE ---
const { authMiddleware } = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/stats', getTeamStats);
router.get('/level-details/:level', getLevelDetails);

module.exports = router;