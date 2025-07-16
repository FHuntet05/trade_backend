// backend/routes/userRoutes.js (NUEVO ARCHIVO v15.0)
const express = require('express');
const { getUserPhoto } = require('../controllers/userController');

const router = express.Router();

// Ruta pública para obtener la foto de perfil de cualquier usuario por su ID de Telegram
router.get('/:telegramId/photo', getUserPhoto);

module.exports = router;