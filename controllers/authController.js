// backend/controllers/authController.js (VERSIÓN v17.0 - ESTRATEGIA URL DIRECTA)
const User = require('../models/userModel');
const PendingReferral = require('../models/pendingReferralModel');
const Setting = require('../models/settingsModel');
const jwt = require('jsonwebtoken');
const { validate, parse } = require('@telegram-apps/init-data-node');
const axios = require('axios');
const { getTemporaryPhotoUrl } = require('./userController'); // <-- IMPORTAMOS LA NUEVA FUNCIÓN

const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const PLACEHOLDER_AVATAR_URL = `${process.env.FRONTEND_URL}/assets/images/user-avatar-placeholder.png`;

const getPhotoFileId = async (userId) => {
    try {
        const response = await axios.get(`${TELEGRAM_API_URL}/getUserProfilePhotos`, {
            params: { user_id: userId, limit: 1 },
            timeout: 5000
        });
        if (response.data.ok && response.data.result.photos.length > 0) {
            const photoArray = response.data.result.photos[0];
            return photoArray[photoArray.length - 1].file_id;
        }
        return null;
    } catch (error) {
        console.error(`Error obteniendo el file_id para ${userId}:`, error.message);
        return null;
    }
};

const generateToken = (id, role, username) => {
    const payload = { id, role, username };
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
};


/**
 * @desc Autentica o registra un usuario desde Telegram.
 *
 * JUSTIFICACIÓN DEL FRACASO v23: El código leía el `startParam` de `req.body` en lugar
 * de leerlo del objeto `parsedData`, que es donde la librería coloca el código
 * de referido que viene nativamente en el `initData`. Esto causaba que el vínculo
 * de referido nunca se estableciera.
 *
 * SOLUCIÓN FÉNIX v24.0:
 * 1. Lee el código de referido EXCLUSIVAMENTE de `parsedData.startParam`.
 * 2. Si hay un referente, la actualización de su lista de referidos se hace con
 *    una operación atómica `$push` (`findByIdAndUpdate`), eliminando el frágil `referrer.save()`.
 * 3. Añadido logging detallado para trazar el flujo de referidos.
 */
const authTelegramUser = async (req, res) => {
    const { initData } = req.body; // Solo necesitamos initData
    if (!initData) {
        return res.status(400).json({ message: 'initData es requerido.' });
    }
    
    try {
        await validate(initData, process.env.TELEGRAM_BOT_TOKEN, { expiresIn: 3600 });
        const parsedData = parse(initData);
        
        // LOG DE DIAGNÓSTICO: Veremos exactamente qué datos llegan.
        console.log('[Auth] Datos parseados de initData:', { 
            user: parsedData.user, 
            startParam: parsedData.startParam 
        });

        const userData = parsedData.user;
        if (!userData) {
            return res.status(401).json({ message: 'Información de usuario no encontrada.' });
        }
        
        const telegramId = userData.id.toString();
        let user = await User.findOne({ telegramId });

        if (!user) { // === Lógica para NUEVO USUARIO ===
            let referrer = null;
            const referrerTelegramId = parsedData.startParam; // <-- ¡LA LÍNEA CLAVE! Leemos del lugar correcto.

            if (referrerTelegramId && referrerTelegramId !== telegramId) {
                referrer = await User.findOne({ telegramId: referrerTelegramId });
                if (referrer) {
                    console.log(`[Referral] Código de referido válido: ${referrerTelegramId}. Referente encontrado: ${referrer.username}`.green);
                } else {
                    console.warn(`[Referral] Código de referido ${referrerTelegramId} no corresponde a un usuario existente.`.yellow);
                }
            }
            
            const photoFileId = await getPhotoFileId(telegramId);
            const fullName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();

            user = new User({ 
                telegramId, 
                username: userData.username || `user_${telegramId}`,
                fullName: fullName || userData.username,
                language: userData.languageCode || 'es', 
                photoFileId: photoFileId,
                referredBy: referrer ? referrer._id : null 
            });
            await user.save(); // Guardamos el nuevo usuario
            
            if (referrer) {
                // Actualización atómica del referente. No más 'referrer.save()'.
                await User.findByIdAndUpdate(referrer._id, {
                    $push: { referrals: { level: 1, user: user._id } }
                });
                console.log(`[Referral] ÉXITO: Usuario ${user.username} ha sido vinculado al referente ${referrer.username}.`.bgGreen.black);
            }
        } else { // === Lógica para USUARIO EXISTENTE ===
            if (!user.photoFileId) {
                user.photoFileId = await getPhotoFileId(telegramId);
                if (user.photoFileId) await user.save();
            }
        }
        
        // El resto del flujo para generar token y devolver datos se mantiene...
        const [userWithTools, settings] = await Promise.all([
            User.findById(user._id).populate('activeTools.tool'),
            Setting.findOneAndUpdate({ singleton: 'global_settings' }, { $setOnInsert: { singleton: 'global_settings' } }, { upsert: true, new: true, setDefaultsOnInsert: true })
        ]);

        const userObject = userWithTools.toObject();
        userObject.photoUrl = await getTemporaryPhotoUrl(userObject.photoFileId) || PLACEHOLDER_AVATAR_URL;

        if (userObject.referredBy) {
            const referrerData = await User.findById(userObject.referredBy).select('telegramId');
            if (referrerData) userObject.referrerId = referrerData.telegramId;
        }
        const token = generateToken(userObject._id, userObject.role, userObject.username);
        res.json({ token, user: userObject, settings });
        
    } catch (error) {
        console.error("Error en authTelegramUser:", error);
        res.status(401).json({ message: `Autenticación fallida: ${error.message}` });
    }
};


const getUserProfile = async (req, res) => {
    try {
        const [user, settings] = await Promise.all([
            User.findById(req.user.id).populate('activeTools.tool'),
            Setting.findOne({ singleton: 'global_settings' })
        ]);
        if (!user) { return res.status(404).json({ message: 'Usuario no encontrado' }); }
        
        const userObject = user.toObject();
        // CORRECCIÓN: Obtenemos la URL de descarga directa de Telegram
        userObject.photoUrl = await getTemporaryPhotoUrl(userObject.photoFileId) || PLACEHOLDER_AVATAR_URL;

        if (userObject.referredBy) {
            const referrerData = await User.findById(userObject.referredBy).select('telegramId');
            if (referrerData) userObject.referrerId = referrerData.telegramId;
        }
        res.json({ user: userObject, settings: settings || {} });
    } catch (error) {
        res.status(500).json({ message: 'Error del servidor' });
    }
};

const loginAdmin = async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Por favor, ingrese usuario y contraseña.' });
    }
    try {
        const adminUser = await User.findOne({
            $or: [{ username: username }, { telegramId: username }]
        }).select('+password');

        if (adminUser && adminUser.role === 'admin' && (await adminUser.matchPassword(password))) {
            const token = generateToken(adminUser._id, adminUser.role, adminUser.username);
            // CORRECCIÓN: Obtenemos la URL de descarga directa de Telegram
            const photoUrl = await getTemporaryPhotoUrl(adminUser.photoFileId) || PLACEHOLDER_AVATAR_URL;
            
            res.json({ 
                _id: adminUser._id, 
                username: adminUser.username, 
                role: adminUser.role, 
                isTwoFactorEnabled: adminUser.isTwoFactorEnabled, 
                token: token, 
                photoUrl: photoUrl 
            });
        } else {
            res.status(401).json({ message: 'Credenciales inválidas.' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error del servidor' });
    }
};

module.exports = { authTelegramUser, getUserProfile, loginAdmin };