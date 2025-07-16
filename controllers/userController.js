// backend/controllers/userController.js (VERSIÓN v17.0 - CON FUNCIÓN REUTILIZABLE)
const axios = require('axios');
const User = require('../models/userModel');
const asyncHandler = require('express-async-handler');

const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const PLACEHOLDER_AVATAR = '/assets/images/user-avatar-placeholder.png'; // Placeholder por defecto

/**
 * @desc    Obtiene la URL de descarga temporal de una foto de Telegram.
 * @param   {string} photoFileId - El file_id permanente de la foto.
 * @returns {Promise<string|null>} La URL temporal o null si falla.
 */
const getTemporaryPhotoUrl = async (photoFileId) => {
    if (!photoFileId) {
        return null;
    }
    try {
        const fileInfoResponse = await axios.get(`${TELEGRAM_API_URL}/getFile`, {
            params: { file_id: photoFileId },
            timeout: 4000 // Timeout agresivo para no bloquear
        });

        if (!fileInfoResponse.data.ok) {
            console.error(`Telegram API no pudo obtener la info del archivo para file_id: ${photoFileId}`);
            return null;
        }

        const filePath = fileInfoResponse.data.result.file_path;
        return `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;
    } catch (error) {
        console.error(`Error al resolver la foto para el file_id ${photoFileId}:`, error.message);
        return null;
    }
};

/**
 * @desc    (Deprecado) Redirige a la URL de la foto. Ya no es la estrategia principal.
 * @route   GET /api/users/:telegramId/photo
 * @access  Public
 */
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

module.exports = {
    getUserPhoto,
    getTemporaryPhotoUrl // <--- EXPORTAMOS LA FUNCIÓN
};