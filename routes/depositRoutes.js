// RUTA: backend/routes/depositRoutes.js
// Rutas para el flujo robusto de depósitos

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createDepositTicket,
  getDepositTicket,
  getMyDepositTickets,
  cancelDepositTicket
} = require('../controllers/depositController');

// Todas las rutas requieren autenticación
router.use(protect);

// Crear un nuevo ticket de depósito
router.post('/create-ticket', createDepositTicket);

// Obtener detalles de un ticket específico
router.get('/ticket/:ticketId', getDepositTicket);

// Obtener todos los tickets del usuario
router.get('/my-tickets', getMyDepositTickets);

// Cancelar un ticket pendiente
router.put('/ticket/:ticketId/cancel', cancelDepositTicket);

module.exports = router;
