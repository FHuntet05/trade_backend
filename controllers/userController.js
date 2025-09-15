// backend/controllers/userController.js (FASE "PERFECTIO" - VARIABLE DE ENTORNO CORREGIDA)
const axios = require('axios');
const User = require('../models/userModel');
const asyncHandler = require('express-async-handler');

const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
// [PERFECTIO - CORRECCIÓN CRÍTICA]
// Se utiliza la variable de entorno estandarizada 'CLIENT_URL' para asegurar que la URL
// del placeholder sea correcta en el entorno de producción de Render.
const PLACEHOLDER_AVATAR = `${process.env.CLIENT_URL}/assets/images/user-avatar-placeholder.png`;

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
            timeout: 4000
        });

        if (!fileInfoResponse.data.ok) {
            console.error(`[PHOTO SERVICE] ERROR: Telegram API no pudo obtener la info del archivo para file_id: ${photoFileId}. Respuesta:`, fileInfoResponse.data);
            return null;
        }

        const filePath = fileInfoResponse.data.result.file_path;
        const finalUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;
        
        return finalUrl;
    } catch (error) {
        console.error(`[PHOTO SERVICE] CATCH: Error al resolver la foto para el file_id ${photoFileId}:`, error.message);
        return null;
    }
};

/**
 * @desc    (Deprecado) Redirige a la URL de la foto. No es la estrategia principal.
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
    getTemporaryPhotoUrl
};