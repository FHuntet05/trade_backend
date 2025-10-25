// RUTA: backend/controllers/userController.js

const axios = require('axios');
const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');
const Setting = require('../models/settingsModel'); // Importar el modelo de Settings
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose'); // Importar mongoose para la sesión
const PendingPurchase = require('../models/pendingPurchaseModel');
const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const PLACEHOLDER_AVATAR = `${process.env.CLIENT_URL}/assets/images/user-avatar-placeholder.png`;

const getTemporaryPhotoUrl = async (photoFileId) => {
    if (!photoFileId) {
        return null;
    }
    try {
        const fileInfoResponse = await axios.get(`${TELEGRAM_API_URL}/getFile`, {
            params: { file_id: photoFileId },
            timeout: 4000
        });
        if (!fileInfoResponse.data.ok) {
            console.error(`[PHOTO SERVICE] ERROR: Telegram API no pudo obtener la info del archivo para file_id: ${photoFileId}. Respuesta:`, fileInfoResponse.data);
            return null;
        }
        const filePath = fileInfoResponse.data.result.file_path;
        return `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;
    } catch (error) {
        console.error(`[PHOTO SERVICE] CATCH: Error al resolver la foto para el file_id ${photoFileId}:`, error.message);
        return null;
    }
};

const getUserPhoto = asyncHandler(async (req, res) => {
    const { telegramId } = req.params;
    const user = await User.findOne({ telegramId }).select('photoFileId').lean();
    if (!user || !user.photoFileId) {
        return res.redirect(PLACEHOLDER_AVATAR);
    }
    const temporaryFileUrl = await getTemporaryPhotoUrl(user.photoFileId);
    if (temporaryFileUrl) {
        res.redirect(302, temporaryFileUrl);
    } else {
        res.redirect(PLACEHOLDER_AVATAR);
    }
});

const getUserTransactions = asyncHandler(async (req, res) => {
    const transactions = await Transaction.find({ user: req.user.id })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

    res.status(200).json(transactions);
});

// --- INICIO DE LA NUEVA FUNCIONALIDAD (Bono Diario) ---
/**
 * @desc    Permite a un usuario reclamar su bono diario.
 * @route   POST /api/user/claim-bonus
 * @access  Private
 */
const claimDailyBonus = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const now = new Date();
    const twentyFourHoursInMs = 24 * 60 * 60 * 1000;

    const [user, settings] = await Promise.all([
        User.findById(userId),
        Setting.findOne({ singleton: 'global_settings' }).lean()
    ]);

    if (!user) {
        res.status(404);
        throw new Error('Usuario no encontrado.');
    }

    if (!settings || !settings.dailyBonusAmount || settings.dailyBonusAmount <= 0) {
        res.status(400);
        throw new Error('El bono diario no está configurado o está deshabilitado.');
    }
    
    if (user.lastBonusClaimedAt) {
        const timeSinceLastClaim = now.getTime() - user.lastBonusClaimedAt.getTime();
        if (timeSinceLastClaim < twentyFourHoursInMs) {
            const timeLeft = twentyFourHoursInMs - timeSinceLastClaim;
            const hours = Math.floor(timeLeft / (1000 * 60 * 60));
            const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            res.status(403); // Forbidden
            throw new Error(`Ya has reclamado tu bono. Inténtalo de nuevo en ${hours}h ${minutes}m.`);
        }
    }

    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const bonusAmount = settings.dailyBonusAmount;

        // LÓGICA DE NEGOCIO CRÍTICA: Añadir el bono al SALDO PARA RETIRO.
        user.withdrawableBalance = (user.withdrawableBalance || 0) + bonusAmount;
        user.lastBonusClaimedAt = now;

        const transaction = new Transaction({
            user: userId,
            type: 'daily_bonus',
            amount: bonusAmount,
            currency: 'USDT',
            status: 'completed',
            description: `Bono diario reclamado.`,
        });

        await transaction.save({ session });
        await user.save({ session });

        await session.commitTransaction();

        res.status(200).json({
            success: true,
            message: `¡Has reclamado ${bonusAmount} USDT!`,
            withdrawableBalance: user.withdrawableBalance,
            lastBonusClaimedAt: user.lastBonusClaimedAt,
        });

    } catch (error) {
        await session.abortTransaction();
        res.status(400); // Bad Request, to pass the error message to the client
        throw new Error(error.message);
    } finally {
        session.endSession();
    }
});
// --- FIN DE LA NUEVA FUNCIONALIDAD (Bono Diario) ---

// --- INICIO DE LA NUEVA FUNCIONALIDAD REQUERIDA ---
/**
 * @desc    Obtiene los detalles de un ticket de compra pendiente específico.
 * @route   GET /api/user/pending-purchase/:ticketId
 * @access  Private
 */
const getPendingPurchaseById = asyncHandler(async (req, res) => {
    const { ticketId } = req.params;
    const userId = req.user.id;

    // 1. Validar que el ID del ticket sea un formato válido.
    if (!mongoose.Types.ObjectId.isValid(ticketId)) {
        res.status(400);
        throw new Error('El formato del ID del ticket no es válido.');
    }

    // 2. Buscar el ticket en la base de datos.
    const ticket = await PendingPurchase.findById(ticketId).lean();

    // 3. Si no se encuentra el ticket, devolver un error 404.
    if (!ticket) {
        res.status(404);
        throw new Error('La orden de compra no fue encontrada. Puede que haya expirado.');
    }

    // 4. Medida de Seguridad CRÍTICA: Asegurarse de que el usuario que solicita
    //    el ticket sea el mismo usuario que lo creó.
    if (ticket.user.toString() !== userId) {
        res.status(403); // 403 Forbidden: No tienes permiso para ver este recurso.
        throw new Error('No tienes autorización para acceder a esta orden de compra.');
    }

    // 5. Si todo es correcto, devolver los datos del ticket.
    res.status(200).json({ success: true, data: ticket });
});
// --- FIN DE LA NUEVA FUNCIONALIDAD REQUERIDA ---

module.exports = {
    getUserPhoto,
    getTemporaryPhotoUrl,
    getUserTransactions,
    claimDailyBonus, // Se exporta la nueva función
    getPendingPurchaseById
};