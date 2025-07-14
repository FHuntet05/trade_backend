// backend/routes/adminRoutes.js

const express = require('express');
const router = express.Router();
const { loginAdmin } = require('../controllers/adminController.js');

// Ruta pública para el login de administradores
router.post('/login', loginAdmin);

// Aquí añadiremos el resto de rutas protegidas en el futuro
// Ejemplo: router.get('/stats', isAdmin, getAdminStats);

module.exports = router;