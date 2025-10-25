// RUTA: backend/routes/quantitativeRoutes.js

const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
    getActivePlans,
    calculateGains,
    initiatePurchase,
    confirmManualPurchase,
    getPlanById // Se importa la nueva función del controlador
} = require('../controllers/quantitativeController');

const router = express.Router();

router.use(protect);

router.route('/plans').get(getActivePlans);

// --- INICIO DE LA NUEVA RUTA ---
// @desc    Obtiene los detalles de un plan específico.
// @route   GET /api/quantitative/plans/:id
router.route('/plans/:id').get(getPlanById);
// --- FIN DE LA NUEVA RUTA ---

router.route('/calculate').post(calculateGains);
router.route('/initiate-purchase').post(initiatePurchase);
router.route('/confirm-manual/:ticketId').post(confirmManualPurchase);

module.exports = router;