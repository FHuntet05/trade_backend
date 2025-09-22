// RUTA: backend/controllers/userController.js (VERSIÓN "NEXUS - UNIFIED TRANSACTION SOURCE")

const axios = require('axios');
const User = require('../models/userModel');
const Transaction = require('../models/transactionModel'); // <-- IMPORTANTE: Se añade el modelo Transaction.
const asyncHandler = require('express-async-handler');

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


// [NEXUS UNIFICATION] - INICIO DE LA NUEVA FUNCIÓN
/**
 * @desc    Obtiene el historial de transacciones de un usuario desde la colección centralizada.
 * @route   (Deberá ser enlazada a GET /api/wallet/history en su archivo de rutas)
 * @access  Private
 */
const getUserTransactions = asyncHandler(async (req, res) => {
    const transactions = await Transaction.find({ user: req.user.id })
        .sort({ createdAt: -1 }) // Ordenar de más reciente a más antiguo
        .limit(100) // Limitar a las últimas 100 transacciones para performance
        .lean(); // Usar .lean() para una consulta más rápida de solo lectura

    res.status(200).json(transactions);
});
// [NEXUS UNIFICATION] - FIN DE LA NUEVA FUNCIÓN

// [OBSOLETO] - La función de ejemplo getMyProfile_EXAMPLE se elimina ya que su lógica será reemplazada.

module.exports = {
    getUserPhoto,
    getTemporaryPhotoUrl,
    getUserTransactions // <-- Se exporta la nueva función.
};