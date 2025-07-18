// backend/routes/taskRoutes.js
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { getTaskStatus, claimTaskReward, markTaskAsVisited } from '../controllers/taskController.js';

const router = express.Router();

// Rutas existentes
router.get('/status', protect, getTaskStatus);
router.post('/claim', protect, claimTaskReward);

// === NUEVA RUTA CRÍTICA ===
// Esta ruta permite al frontend notificar al backend que el usuario ha
// interactuado con una tarea externa, como visitar un enlace.
router.post('/mark-as-visited', protect, markTaskAsVisited);

export default router;