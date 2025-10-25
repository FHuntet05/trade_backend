// RUTA: backend/routes/quantitativeRoutes.js

const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
    getActivePlans,
    calculateGains,
    initiatePurchase,
    confirmManualPurchase,
    getPlanById // --- CAMBIO CLAVE: Asegurarse de que se importa correctamente ---
} = require('../controllers/quantitativeController');

const router = express.Router();

router.use(protect);

router.route('/plans').get(getActivePlans);

// @desc    Obtiene los detalles de un plan específico.
// @route   GET /api/quantitative/plans/:id
router.route('/plans/:id').get(getPlanById); // Esta es la línea que causaba el crash

router.route('/calculate').post(calculateGains);
router.route('/initiate-purchase').post(initiatePurchase);
router.route('/confirm-manual/:ticketId').post(confirmManualPurchase);

module.exports = router;