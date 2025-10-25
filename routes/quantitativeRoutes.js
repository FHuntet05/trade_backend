// RUTA: backend/routes/quantitativeRoutes.js

const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
    getActivePlans,
    calculateGains,
    initiatePurchase,
    confirmManualPurchase
} = require('../controllers/quantitativeController');

const router = express.Router();

// Todas las rutas en este archivo están protegidas y requieren autenticación.
router.use(protect);

// @desc    Obtiene todos los planes cuantitativos activos para los usuarios.
// @route   GET /api/quantitative/plans
router.route('/plans').get(getActivePlans);

// @desc    Calcula las ganancias proyectadas de un plan.
// @route   POST /api/quantitative/calculate
router.route('/calculate').post(calculateGains);

// @desc    Inicia el proceso de compra de un plan.
// @route   POST /api/quantitative/initiate-purchase
router.route('/initiate-purchase').post(initiatePurchase);

// @desc    Confirma manualmente una compra pendiente.
// @route   POST /api/quantitative/confirm-manual/:ticketId
router.route('/confirm-manual/:ticketId').post(confirmManualPurchase);

module.exports = router;