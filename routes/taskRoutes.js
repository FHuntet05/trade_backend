// backend/routes/taskRoutes.js (CORREGIDO)
const express = require('express');
const router = express.Router();
const { getTaskStatus, claimTaskReward } = require('../controllers/taskController');

// --- CORRECCIÓN CLAVE ---
// Importamos 'protect' correctamente.
const { protect } = require('../middleware/authMiddleware');

// Aplicamos el middleware 'protect' a todas las rutas de este archivo.
router.use(protect);

router.get('/status', getTaskStatus);
router.post('/claim', claimTaskReward);

module.exports = router;