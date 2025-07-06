// backend/routes/teamRoutes.js (VERSIÓN ACTUALIZADA)

const express = require('express');
const router = express.Router();

// 1. Importamos el nuevo controlador
const { getTeamStats, getLevelDetails } = require('../controllers/teamController');
const authMiddleware = require('../middleware/authMiddleware');

// Usamos el middleware de autenticación para todas las rutas de este archivo
router.use(authMiddleware);

// Ruta para obtener las estadísticas generales del equipo
router.get('/stats', getTeamStats);

// 2. Añadimos la nueva ruta para obtener los detalles de un nivel específico
// El ':level' en la URL será accesible en req.params.level en el controlador
router.get('/level-details/:level', getLevelDetails);

module.exports = router;