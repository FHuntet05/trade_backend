// backend/routes/rankingRoutes.js (CORREGIDO)
const express = require('express');
const router = express.Router();
const { getRanking } = require('../controllers/rankingController');
// --- LA CORRECCIÓN CLAVE ---
// Importamos el middleware desestructurando el objeto.
const { authMiddleware } = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', getRanking);

module.exports = router;