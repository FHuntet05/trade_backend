// RUTA: backend/controllers/wheelController.js

const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const User = require('../models/userModel');
const WheelConfig = require('../models/wheelModel');
const Transaction = require('../models/transactionModel');

/**
 * @desc    Obtiene la configuración actual de la ruleta.
 * @route   GET /api/wheel/config
 * @access  Private
 */
const getWheelConfig = asyncHandler(async (req, res) => {
    const config = await WheelConfig.findOne({ singleton: 'global_wheel_config' }).lean();
    if (!config) {
        res.status(404);
        throw new Error('La configuración de la ruleta no ha sido establecida por el administrador.');
    }
    // Devolvemos solo los datos necesarios para que el frontend renderice la ruleta
    const frontendConfig = {
        segments: config.segments.map(s => ({
            text: s.text,
            imageUrl: s.imageUrl,
        })),
    };
    res.status(200).json({ success: true, data: frontendConfig });
});

/**
 * @desc    Ejecuta un giro de la ruleta para el usuario autenticado.
 * @route   POST /api/wheel/spin
 * @access  Private
 */
const spinWheel = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const user = await User.findById(userId).session(session);
        if (!user) {
            throw new Error('Usuario no encontrado.');
        }

        if (user.balance.spins < 1) {
            throw new Error('No tienes suficientes giros.');
        }

        const config = await WheelConfig.findOne({ singleton: 'global_wheel_config' }).session(session);
        if (!config || config.segments.length !== 8) {
            throw new Error('La ruleta no está configurada correctamente.');
        }

        const activeSegments = config.segments.filter(s => s.isActive);
        if (activeSegments.length === 0) {
            throw new Error('No hay premios activos en la ruleta en este momento.');
        }

        let chosenSegment;

        // --- LÓGICA DE NEGOCIO: SISTEMA DE PIEDAD (Pity System) ---
        if (user.pitySpinCount >= config.pitySystemThreshold && config.pitySystemGuaranteedPrizeSegmentId) {
            chosenSegment = activeSegments.find(s => s._id.equals(config.pitySystemGuaranteedPrizeSegmentId));
            if (!chosenSegment) {
                // Fallback: si el premio de piedad fue desactivado, usar el sistema ponderado.
                console.warn(`[Wheel] El premio de piedad ${config.pitySystemGuaranteedPrizeSegmentId} no está activo. Usando sistema ponderado.`);
                chosenSegment = selectSegmentByWeight(activeSegments);
            } else {
                 console.log(`[Wheel] Sistema de Piedad activado para el usuario ${user.username}.`);
            }
        } else {
            // --- LÓGICA DE NEGOCIO: PONDERADO (Weighted Chance) ---
            chosenSegment = selectSegmentByWeight(activeSegments);
        }

        if (!chosenSegment) {
             throw new Error('No se pudo determinar un premio. Inténtalo de nuevo.');
        }

        // Decrementar giros y actualizar contador de piedad
        user.balance.spins -= 1;
        if (chosenSegment.isRare) {
            user.pitySpinCount = 0; // Se resetea el contador
        } else {
            user.pitySpinCount += 1;
        }

        // Acreditar el premio
        const transaction = new Transaction({
            user: userId,
            type: 'wheel_spin_win',
            description: `Premio de la ruleta: ${chosenSegment.text}`,
            metadata: { segmentId: chosenSegment._id.toString() }
        });

        switch (chosenSegment.type) {
            case 'usdt':
                user.withdrawableBalance += chosenSegment.value;
                transaction.amount = chosenSegment.value;
                transaction.currency = 'USDT';
                break;
            case 'xp':
                user.balance.ntx += chosenSegment.value; // ntx = XP
                transaction.amount = chosenSegment.value;
                transaction.currency = 'NTX';
                break;
            case 'spins':
                user.balance.spins += chosenSegment.value;
                transaction.amount = chosenSegment.value;
                transaction.currency = 'SPINS';
                break;
            default:
                throw new Error(`Tipo de premio no soportado: ${chosenSegment.type}`);
        }

        await transaction.save({ session });
        await user.save({ session });
        await session.commitTransaction();

        res.status(200).json({
            success: true,
            message: `¡Has ganado ${chosenSegment.text}!`,
            prize: {
                type: chosenSegment.type,
                value: chosenSegment.value,
                text: chosenSegment.text,
            },
            resultIndex: config.segments.findIndex(s => s._id.equals(chosenSegment._id)), // Para que el frontend sepa dónde detenerse
            newBalances: {
                spins: user.balance.spins,
                xp: user.balance.ntx,
                withdrawable: user.withdrawableBalance,
            }
        });

    } catch (error) {
        await session.abortTransaction();
        res.status(400);
        throw new Error(error.message);
    } finally {
        session.endSession();
    }
});

/**
 * Función auxiliar para seleccionar un segmento basado en su peso.
 * @param {Array} segments - Array de segmentos activos.
 * @returns {object} - El segmento elegido.
 */
function selectSegmentByWeight(segments) {
    const totalWeight = segments.reduce((sum, s) => sum + s.weight, 0);
    let randomWeight = Math.random() * totalWeight;

    for (const segment of segments) {
        if (randomWeight < segment.weight) {
            return segment;
        }
        randomWeight -= segment.weight;
    }
    // Fallback en caso de errores de punto flotante
    return segments[segments.length - 1];
}

module.exports = {
    getWheelConfig,
    spinWheel,
};