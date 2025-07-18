// RUTA: backend/routes/taskRoutes.js (COMPLETO Y REPARADO v21.22)

const express = require('express');
const router = express.Router();
const { getTaskStatus, claimTask, markTaskAsVisited } = require('../controllers/taskController');
const { protect } = require('../middleware/authMiddleware');

router.get('/status', protect, getTaskStatus);
router.post('/claim', protect, claimTask);

// --- INICIO DE LA LÍNEA FALTANTE ---
// Registramos la ruta POST que el frontend está buscando.
router.post('/mark-as-visited', protect, markTaskAsVisited);
// --- FIN DE LA LÍNEA FALTANTE ---

module.exports = router;