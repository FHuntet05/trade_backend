// backend/routes/userRoutes.js

const express = require('express');
// --- INICIO DE LA MODIFICACIÓN ---
const { getUserPhoto, claimDailyBonus } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware'); // Importar el middleware de protección
// --- FIN DE LA MODIFICACIÓN ---

const router = express.Router();

// --- INICIO DE LA MODIFICACIÓN ---
// Se añade la nueva ruta POST para reclamar el bono diario.
// Está protegida para asegurar que solo usuarios autenticados puedan acceder a ella.
router.route('/claim-bonus').post(protect, claimDailyBonus);
// --- FIN DE LA MODIFICACIÓN ---

// Ruta pública para obtener la foto de perfil de cualquier usuario por su ID de Telegram
router.get('/:telegramId/photo', getUserPhoto);

module.exports = router;