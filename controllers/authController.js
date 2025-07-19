// backend/controllers/authController.js (VERSIÓN COMPLETA CON LOGGING EXHAUSTIVO)
const User = require('../models/userModel');
const Setting = require('../models/settingsModel');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const mongoose = require('mongoose');
const { getTemporaryPhotoUrl } = require('./userController');

const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const PLACEHOLDER_AVATAR_URL = `${process.env.FRONTEND_URL}/assets/images/user-avatar-placeholder.png`;

// --- Función de utilidad para obtener la foto (con logging) ---
const getPhotoFileId = async (userId) => {
    console.log(`[SYNC-TRACE] ---> [getPhotoFileId] Iniciando para userId: ${userId}`);
    try {
        const response = await axios.get(`${TELEGRAM_API_URL}/getUserProfilePhotos`, {
            params: { user_id: userId, limit: 1 },
            timeout: 5000
        });
        if (response.data.ok && response.data.result.photos.length > 0) {
            const photoArray = response.data.result.photos[0];
            const fileId = photoArray[photoArray.length - 1].file_id;
            console.log(`[SYNC-TRACE] ---> [getPhotoFileId] Éxito. file_id encontrado: ${fileId}`);
            return fileId;
        }
        console.log(`[SYNC-TRACE] ---> [getPhotoFileId] Advertencia: No se encontraron fotos para el usuario.`);
        return null;
    } catch (error) {
        console.error(`[SYNC-TRACE] ---> [getPhotoFileId] ERROR: No se pudo obtener el file_id para ${userId}:`, error.message);
        return null;
    }
};

const generateToken = (id, role, username) => {
    const payload = { id, role, username };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
    console.log(`[SYNC-TRACE] ----> Token JWT generado para el usuario ${username}`);
    return token;
};

// La única función que nos importa ahora
const syncUser = async (req, res) => {
    // Si vemos este log, la conexión FUNCIONA.
    console.log(`\n\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
    console.log(`[CONEXIÓN ESTABLECIDA] /api/auth/sync FUE ALCANZADO.`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n\n`);

    // Devolvemos una respuesta simple y estática. SIN base de datos, SIN lógica.
    res.status(200).json({
        message: "¡CONEXIÓN EXITOSA! El backend respondió.",
        token: "fake-token-para-probar",
        user: { 
            _id: "fakeUserId",
            username: "Usuario de Prueba",
            fullName: "Conexión Establecida",
            photoUrl: "https://i.imgur.com/8pA049j.png" // Un avatar de prueba
        },
        settings: {}
    });
};

// Dejamos las otras funciones vacías para que no haya errores de importación
const getUserProfile = async (req, res) => res.status(501).json({message: "Not Implemented"});
const loginAdmin = async (req, res) => res.status(501).json({message: "Not Implemented"});

module.exports = {
    syncUser,
    getUserProfile,
    loginAdmin,
};