// backend/controllers/userController.js (FASE "PERFECTIO" + LÓGICA DE FILTRADO DE EJEMPLO)
const axios = require('axios');
const User = require('../models/userModel');
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


// ======================= INICIO DE LA LÓGICA DE EJEMPLO =======================
// [NEXUS ENFORCEMENT] - ¡ATENCIÓN!
// Esta función es un EJEMPLO. La lógica real de sincronización de usuario
// está en su `authController.js`. Deberá aplicar este mismo filtro allí.
const getMyProfile_EXAMPLE = asyncHandler(async (req, res) => {
    // 1. Encuentra al usuario (en su caso, esto ya sucede en la función de sync/login)
    const user = await User.findById(req.user.id);

    if (user) {
        // 2. Antes de enviar la respuesta, filtramos las transacciones
        const filteredTransactions = user.transactions.filter(
            (tx) => tx.type !== 'admin_action'
        );

        // Creamos un objeto de usuario seguro para enviar al frontend
        const safeUser = {
            ...user.toObject(), // Convertimos el documento de Mongoose a un objeto plano
            transactions: filteredTransactions, // Reemplazamos con las transacciones filtradas
        };
        
        // 3. Envía el objeto de usuario "limpio"
        res.json(safeUser);
    } else {
        res.status(404);
        throw new Error('Usuario no encontrado');
    }
});
// ======================== FIN DE LA LÓGICA DE EJEMPLO =========================


module.exports = {
    getUserPhoto,
    getTemporaryPhotoUrl
};