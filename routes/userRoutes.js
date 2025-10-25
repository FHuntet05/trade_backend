// RUTA: backend/routes/userRoutes.js

const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  getUserPhoto,
  getUserTransactions,
  claimDailyBonus,
  getPendingPurchaseById // Se importa la nueva función del controlador.
} = require('../controllers/userController');

const router = express.Router();

// Todas las rutas aquí están protegidas por defecto.
router.use(protect);

router.get('/photo/:telegramId', getUserPhoto);
router.get('/transactions', getUserTransactions);
router.post('/claim-bonus', claimDailyBonus);

// --- INICIO DE LA NUEVA RUTA ---
// @desc    Ruta para que la página de depósito pendiente obtenga los detalles de la orden.
// @route   GET /api/user/pending-purchase/:ticketId
router.route('/pending-purchase/:ticketId').get(getPendingPurchaseById);
// --- FIN DE LA NUEVA RUTA ---

module.exports = router;