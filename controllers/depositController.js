// RUTA: backend/controllers/depositController.js
// Controlador para gestionar el flujo robusto de depósitos

const asyncHandler = require('express-async-handler');
const DepositTicket = require('../models/depositTicketModel');
const CryptoWallet = require('../models/cryptoWalletModel');
const Setting = require('../models/settingsModel');

const serializeDepositTicket = (ticket) => {
  const metadata = ticket.metadata && typeof ticket.metadata.toObject === 'function'
    ? ticket.metadata.toObject()
    : ticket.metadata instanceof Map
      ? Object.fromEntries(ticket.metadata)
      : ticket.metadata || {};

  return {
    ticketId: ticket._id.toString(),
    depositAddress: ticket.depositAddress,
    chain: ticket.chain,
    amount: ticket.amount,
    currency: ticket.currency,
    methodKey: ticket.methodKey,
    methodType: ticket.methodType,
    methodName: ticket.methodName,
    instructions: ticket.instructions,
    status: ticket.status,
    expiresAt: ticket.expiresAt,
    createdAt: ticket.createdAt,
    completedAt: ticket.completedAt,
    detectedTxHash: ticket.detectedTxHash,
    manualSubmission: ticket.manualSubmission || null,
    metadata,
  };
};

const depositController = {
  /**
   * @desc    Crea un ticket de depósito único para el usuario
   * @route   POST /api/deposits/create-ticket
   * @access  Private
   */
  createDepositTicket: asyncHandler(async (req, res) => {
    const { amount, methodKey } = req.body;
    const userId = req.user._id;
    const numericAmount = Number(amount);

    // Validar monto
    if (!numericAmount || Number.isNaN(numericAmount) || numericAmount < 0.01) {
      res.status(400);
      throw new Error('El monto mínimo para depositar es 0.01 USDT');
    }

    if (!methodKey) {
      res.status(400);
      throw new Error('Debes seleccionar un método de depósito válido.');
    }

    const settings = await Setting.findOne({ singleton: 'global_settings' });
    if (!settings) {
      res.status(500);
      throw new Error('Configuración del sistema no encontrada.');
    }

    const selectedOption = settings.depositOptions.find(option => option.key === methodKey);

    if (!selectedOption || !selectedOption.isActive) {
      res.status(400);
      throw new Error('El método de depósito seleccionado no está disponible.');
    }

    const methodType = selectedOption.type || 'manual';
    const currency = selectedOption.currency || 'USDT';
    const chain = selectedOption.chain || null;
    const minimumAllowed = selectedOption.minAmount && selectedOption.minAmount > 0
      ? selectedOption.minAmount
      : 0.01;

    if (numericAmount < minimumAllowed) {
      res.status(400);
      throw new Error(`El monto mínimo para este método es ${minimumAllowed} ${currency}.`);
    }

    if (selectedOption.maxAmount && selectedOption.maxAmount > 0 && numericAmount > selectedOption.maxAmount) {
      res.status(400);
      throw new Error(`El monto máximo para este método es ${selectedOption.maxAmount} ${currency}.`);
    }

    const ticketPayload = {
      user: userId,
      amount: numericAmount,
      currency,
      methodKey,
      methodName: selectedOption.name,
      methodType,
      chain,
      depositAddress: selectedOption.address || null,
      instructions: selectedOption.instructions || '',
      metadata: {
        depositOptionKey: methodKey,
        depositOptionName: selectedOption.name,
      }
    };

    if (chain) {
      ticketPayload.metadata.chain = chain;
    }

    if (methodType === 'automatic') {
      if (currency !== 'USDT') {
        res.status(400);
        throw new Error('Los métodos automáticos solo admiten depósitos en USDT.');
      }

      if (!chain) {
        res.status(400);
        throw new Error('Este método requiere una red válida.');
      }

      const wallet = await CryptoWallet.findOne({ user: userId, chain });

      if (!wallet) {
        res.status(400);
        throw new Error(`No tienes una billetera configurada para ${chain}. Contacta al soporte.`);
      }

      // Verificar tickets automáticos activos sin expirar
      const existingTicket = await DepositTicket.findOne({
        user: userId,
        status: 'pending',
        methodType: 'automatic',
        expiresAt: { $gt: new Date() }
      });

      if (existingTicket) {
        res.status(400);
        throw new Error('Ya tienes un ticket de depósito automático pendiente. Completa o espera a que expire.');
      }

      ticketPayload.depositAddress = wallet.address;
      ticketPayload.metadata.walletId = wallet._id.toString();
    }

    const ticket = await DepositTicket.create(ticketPayload);

    res.status(201).json({
      success: true,
      data: serializeDepositTicket(ticket)
    });
  }),

  /**
   * @desc    Obtiene los detalles de un ticket de depósito
   * @route   GET /api/deposits/ticket/:ticketId
   * @access  Private
   */
  getDepositTicket: asyncHandler(async (req, res) => {
    const { ticketId } = req.params;
    const userId = req.user._id;

    const ticket = await DepositTicket.findOne({
      _id: ticketId,
      user: userId
    });

    if (!ticket) {
      res.status(404);
      throw new Error('Ticket de depósito no encontrado');
    }

    // Verificar si ha expirado
    if (ticket.isExpired()) {
      ticket.status = 'expired';
      await ticket.save();
    }

    res.json({
      success: true,
      data: serializeDepositTicket(ticket)
    });
  }),

  /**
   * @desc    Obtiene todos los tickets de depósito del usuario
   * @route   GET /api/deposits/my-tickets
   * @access  Private
   */
  getMyDepositTickets: asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { status, limit = 10 } = req.query;

    const query = { user: userId };
    if (status) {
      query.status = status;
    }

    const tickets = await DepositTicket.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: tickets.map(serializeDepositTicket)
    });
  }),

  /**
   * @desc    Cancela un ticket de depósito pendiente
   * @route   PUT /api/deposits/ticket/:ticketId/cancel
   * @access  Private
   */
  cancelDepositTicket: asyncHandler(async (req, res) => {
    const { ticketId } = req.params;
    const userId = req.user._id;

    const ticket = await DepositTicket.findOne({
      _id: ticketId,
      user: userId,
      status: { $in: ['pending', 'awaiting_manual_review'] }
    });

    if (!ticket) {
      res.status(404);
      throw new Error('Ticket no encontrado o ya no está pendiente');
    }

    ticket.status = 'cancelled';
    await ticket.save();

    res.json({
      success: true,
      message: 'Ticket cancelado exitosamente',
      data: serializeDepositTicket(ticket)
    });
  })
};

module.exports = depositController;
