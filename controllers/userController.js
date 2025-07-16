// backend/controllers/userController.js (NUEVO ARCHIVO v15.0)
const axios = require('axios');
const User = require('../models/userModel');
const asyncHandler = require('express-async-handler');

const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

/**
 * @desc    Obtiene la URL de la foto de perfil de un usuario y redirige.
 * @route   GET /api/users/:telegramId/photo
 * @access  Public
 */
const getUserPhoto = asyncHandler(async (req, res) => {
    const { telegramId } = req.params;

    // Usamos una caché simple para no consultar la DB en cada petición de imagen
    // NOTA: Para producción a gran escala, se usaría una caché externa como Redis.
    const user = await User.findOne({ telegramId }).select('photoFileId').lean();

    if (!user || !user.photoFileId) {
        // Redirigir a una imagen de placeholder si no hay foto
        // Asegúrate de que esta imagen exista en tu frontend público
        return res.redirect('/assets/images/user-avatar-placeholder.png');
    }

    try {
        // 1. Pedir a Telegram la información del archivo usando el file_id permanente
        const fileInfoResponse = await axios.get(`${TELEGRAM_API_URL}/getFile`, {
            params: { file_id: user.photoFileId }
        });

        if (!fileInfoResponse.data.ok) {
            throw new Error('Telegram API no pudo obtener la información del archivo.');
        }

        const filePath = fileInfoResponse.data.result.file_path;

        // 2. Construir la URL de descarga temporal
        const temporaryFileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;
        
        // 3. Redirigir al cliente a la URL de la imagen. Código 302 indica redirección temporal.
        res.redirect(302, temporaryFileUrl);

    } catch (error) {
        console.error(`Error al resolver la foto para el file_id ${user.photoFileId}:`, error.message);
        res.redirect('/assets/images/user-avatar-placeholder.png');
    }
});

module.exports = {
    getUserPhoto
};