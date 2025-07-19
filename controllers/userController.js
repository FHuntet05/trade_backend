// backend/controllers/userController.js (VERSIÓN INSTRUMENTADA Y COMPLETA)
const axios = require('axios');
const User = require('../models/userModel');
const asyncHandler = require('express-async-handler');

const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
// Asegurémonos de que el placeholder sea una URL completa para evitar problemas
const PLACEHOLDER_AVATAR = `${process.env.FRONTEND_URL}/assets/images/user-avatar-placeholder.png`;

/**
 * @desc    Obtiene la URL de descarga temporal de una foto de Telegram.
 * @param   {string} photoFileId - El file_id permanente de la foto.
 * @returns {Promise<string|null>} La URL temporal o null si falla.
 */
const getTemporaryPhotoUrl = async (photoFileId) => {
    // 1. PUNTO DE ENTRADA
    console.log(`[PHOTO-TRACE] ---> [getTemporaryPhotoUrl] Invocado.`);
    if (!photoFileId) {
        console.log(`[PHOTO-TRACE] ---> [getTemporaryPhotoUrl] No hay photoFileId. Retornando null.`);
        return null;
    }
    console.log(`[PHOTO-TRACE] ---> [getTemporaryPhotoUrl] Intentando resolver file_id: ${photoFileId}`);

    try {
        // 2. LLAMADA A LA API DE TELEGRAM
        console.log(`[PHOTO-TRACE] ---> [getTemporaryPhotoUrl] Realizando llamada a /getFile...`);
        const fileInfoResponse = await axios.get(`${TELEGRAM_API_URL}/getFile`, {
            params: { file_id: photoFileId },
            timeout: 4000 // Timeout agresivo para no bloquear
        });

        if (!fileInfoResponse.data.ok) {
            console.error(`[PHOTO-TRACE] ---> [getTemporaryPhotoUrl] ERROR: Telegram API no pudo obtener la info del archivo para file_id: ${photoFileId}. Respuesta:`, fileInfoResponse.data);
            return null;
        }

        const filePath = fileInfoResponse.data.result.file_path;
        const finalUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;
        
        // 3. ÉXITO
        console.log(`[PHOTO-TRACE] ---> [getTemporaryPhotoUrl] Éxito. URL generada.`);
        return finalUrl;
    } catch (error) {
        // 4. FALLO
        console.error(`[PHOTO-TRACE] ---> [getTemporaryPhotoUrl] CATCH: Error al resolver la foto para el file_id ${photoFileId}:`, error.message);
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
    getTemporaryPhotoUrl
};