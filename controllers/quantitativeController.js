// RUTA: backend/controllers/quantitativeController.js

const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const User = require('../models/userModel');
const QuantitativeItem = require('../models/quantitativeItemModel');
const PendingPurchase = require('../models/pendingPurchaseModel');
const Transaction = require('../models/transactionModel');
const CryptoWallet = require('../models/cryptoWalletModel'); // Para asignar wallets de depósito

/**
 * @desc    Obtiene todos los planes cuantitativos activos.
 * @route   GET /api/quantitative/plans
 * @access  Private
 */
const getActivePlans = asyncHandler(async (req, res) => {
    const plans = await QuantitativeItem.find({ isActive: true }).sort({ displayOrder: 'asc' });
    res.status(200).json({ success: true, data: plans });
});

/**
 * @desc    Calcula las ganancias proyectadas para un plan y un monto dados.
 * @route   POST /api/quantitative/calculate
 * @access  Private
 */
const calculateGains = asyncHandler(async (req, res) => {
    const { planId, amount } = req.body;
    const numericAmount = parseFloat(amount);

    if (!mongoose.Types.ObjectId.isValid(planId) || isNaN(numericAmount) || numericAmount <= 0) {
        res.status(400);
        throw new Error('Datos de entrada inválidos.');
    }

    const plan = await QuantitativeItem.findById(planId).lean();
    if (!plan) {
        res.status(404);
        throw new Error('Plan no encontrado.');
    }

    const dailyGain = numericAmount * (plan.dailyPercentage / 100);
    const totalGain = dailyGain * plan.durationDays;
    const totalReturn = numericAmount + totalGain;

    res.status(200).json({
        success: true,
        data: {
            dailyGain: dailyGain.toFixed(2),
            totalGain: totalGain.toFixed(2),
            totalReturn: totalReturn.toFixed(2)
        }
    });
});

/**
 * @desc    Inicia el proceso de compra de un plan cuantitativo.
 * @route   POST /api/quantitative/initiate-purchase
 * @access  Private
 */
const initiatePurchase = asyncHandler(async (req, res) => {
    const { planId, amount } = req.body;
    const userId = req.user.id;
    const purchaseAmount = parseFloat(amount);

    if (!mongoose.Types.ObjectId.isValid(planId) || isNaN(purchaseAmount) || purchaseAmount <= 0) {
        res.status(400);
        throw new Error('Datos de compra inválidos.');
    }

    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const plan = await QuantitativeItem.findById(planId).session(session);
        if (!plan || !plan.isActive) {
            throw new Error('El plan seleccionado no está disponible.');
        }

        if (purchaseAmount < plan.minInvestment || purchaseAmount > plan.maxInvestment) {
            throw new Error(`El monto de la inversión debe estar entre ${plan.minInvestment} y ${plan.maxInvestment} USDT.`);
        }

        const user = await User.findById(userId).session(session);
        if (!user) {
            throw new Error('Usuario no encontrado.');
        }

        // --- Path A (Saldo Suficiente) ---
        if (user.balance.usdt >= purchaseAmount) {
            user.balance.usdt -= purchaseAmount;

            const transaction = new Transaction({
                user: userId,
                type: 'purchase',
                amount: -purchaseAmount,
                currency: 'USDT',
                status: 'completed',
                description: `Compra de plan cuantitativo: ${plan.name}`,
                metadata: {
                    planId: plan._id.toString(),
                    planName: plan.name,
                    investedAmount: purchaseAmount.toString()
                }
            });
            // NOTA: La lógica de activación del plan (ej. añadir a 'activeInvestments') se manejará
            // en un servicio separado que se ejecuta periódicamente para procesar estas transacciones.
            // Por ahora, solo se registra la compra.
            
            await transaction.save({ session });
            await user.save({ session });
            await session.commitTransaction();

            return res.status(200).json({
                success: true,
                purchaseType: 'instant',
                message: 'Compra realizada con éxito utilizando tu saldo.',
                newBalance: user.balance.usdt
            });
        }
        
        // --- Path B (Depósito Requerido) ---
        else {
            let userWallet = await CryptoWallet.findOne({ user: userId, chain: 'BSC' }).session(session);
            if (!userWallet) {
                // Aquí se debería llamar a un servicio que genere una nueva wallet para el usuario.
                // Por ahora, simularemos que ya existe o lanzaremos un error.
                throw new Error('No se encontró una billetera de depósito para el usuario. Contacte a soporte.');
            }

            const pendingPurchase = new PendingPurchase({
                user: userId,
                plan: planId,
                amount: purchaseAmount,
                depositAddress: userWallet.address,
            });

            await pendingPurchase.save({ session });
            await session.commitTransaction();

            return res.status(202).json({ // 202 Accepted: La solicitud ha sido aceptada pero el procesamiento no ha finalizado.
                success: true,
                purchaseType: 'deposit_required',
                message: 'Saldo insuficiente. Se ha generado una orden de depósito.',
                data: {
                    ticketId: pendingPurchase._id,
                    depositAddress: pendingPurchase.depositAddress,
                    requiredAmount: pendingPurchase.amount,
                    expiresAt: pendingPurchase.expiresAt,
                }
            });
        }
    } catch (error) {
        await session.abortTransaction();
        res.status(400);
        throw new Error(error.message);
    } finally {
        session.endSession();
    }
});

/**
 * @desc    Permite al usuario intentar confirmar manualmente una compra pendiente.
 * @route   POST /api/quantitative/confirm-manual/:ticketId
 * @access  Private
 */
const confirmManualPurchase = asyncHandler(async (req, res) => {
    const { ticketId } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(ticketId)) {
        res.status(400);
        throw new Error('ID de ticket inválido.');
    }

    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const ticket = await PendingPurchase.findById(ticketId).session(session);
        if (!ticket || ticket.user.toString() !== userId) {
            throw new Error('Ticket de compra no encontrado o no te pertenece.');
        }

        if (ticket.status !== 'manual_confirmation') {
            throw new Error(`El ticket no está en estado de confirmación manual. Estado actual: ${ticket.status}.`);
        }

        const plan = await QuantitativeItem.findById(ticket.plan).session(session);
        if (!plan) {
            throw new Error('El plan asociado a este ticket ya no existe.');
        }

        const user = await User.findById(userId).session(session);
        if (user.balance.usdt < ticket.amount) {
            throw new Error('Aún no tienes saldo suficiente para completar esta compra.');
        }

        // El usuario ya tiene el saldo (probablemente de un depósito que no se detectó automáticamente)
        user.balance.usdt -= ticket.amount;

        const transaction = new Transaction({
            user: userId,
            type: 'purchase',
            amount: -ticket.amount,
            currency: 'USDT',
            status: 'completed',
            description: `Compra de plan (manual): ${plan.name}`,
            metadata: {
                planId: plan._id.toString(),
                planName: plan.name,
                investedAmount: ticket.amount.toString(),
                originalTicketId: ticket._id.toString()
            }
        });

        ticket.status = 'paid';
        
        await transaction.save({ session });
        await user.save({ session });
        await ticket.save({ session });
        await session.commitTransaction();

        res.status(200).json({
            success: true,
            message: '¡Compra completada exitosamente!',
            newBalance: user.balance.usdt
        });

    } catch (error) {
        await session.abortTransaction();
        res.status(400);
        throw new Error(error.message);
    } finally {
        session.endSession();
    }
});


module.exports = {
    getActivePlans,
    calculateGains,
    initiatePurchase,
    confirmManualPurchase
};