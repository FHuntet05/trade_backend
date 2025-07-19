// backend/controllers/authController.js (CÓDIGO COMPLETO CON LOGGING)
const User = require('../models/userModel');
const Setting = require('../models/settingsModel');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { getTemporaryPhotoUrl } = require('./userController');

const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const PLACEHOLDER_AVATAR_URL = `${process.env.FRONTEND_URL}/assets/images/user-avatar-placeholder.png`;

// --- FUNCIONES DE UTILIDAD (COMPLETAS) ---
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


// --- CONTROLADOR DE SINCRONIZACIÓN (COMPLETO CON LOGGING) ---
const syncUser = async (req, res) => {
    console.log('[Controller] -> /api/auth/sync: Petición RECIBIDA.');
    const { user: tgUser, refCode } = req.body;
    console.log('[Controller] -> /api/auth/sync: Body de la petición:', { tgUser, refCode });

    if (!tgUser || !tgUser.id) {
        console.error('[Controller] -> /api/auth/sync: ERROR - tgUser o tgUser.id no encontrados en el body.');
        return res.status(400).json({ message: 'Datos de usuario de Telegram son requeridos.' });
    }

    try {
        const telegramId = tgUser.id.toString();
        let user = await User.findOne({ telegramId });

        if (!user) {
            console.log(`[Controller] -> /api/auth/sync: Usuario con ID ${telegramId} no encontrado. Creando nuevo usuario...`);
            const photoFileId = await getPhotoFileId(telegramId);
            const fullName = `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim();
            const newUser_data = {
                telegramId,
                username: tgUser.username || `user_${telegramId}`,
                fullName: fullName || tgUser.username,
                language: tgUser.language_code || 'es',
                photoFileId
            };
            let referrer = null;
            if (refCode && refCode !== 'null' && refCode !== 'undefined') {
                referrer = await User.findOne({ telegramId: refCode });
                if(referrer) {
                    console.log(`[Controller] -> /api/auth/sync: Referente encontrado: ${referrer.username}`);
                    newUser_data.referredBy = referrer._id;
                } else {
                    console.warn(`[Controller] -> /api/auth/sync: Referente con telegramId '${refCode}' no encontrado.`);
                }
            }
            user = new User(newUser_data);
            await user.save();
            if (referrer) {
                await User.updateOne({ _id: referrer._id }, { $push: { 'referrals': { level: 1, user: user._id } } });
                console.log(`[Controller] -> /api/auth/sync: Éxito al vincular usuario ${user.username} a ${referrer.username}.`);
            }
        } else {
            console.log(`[Controller] -> /api/auth/sync: Usuario con ID ${telegramId} encontrado. Actualizando...`);
            user.username = tgUser.username || user.username;
            user.fullName = `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim() || user.fullName;
            if (!user.photoFileId) {
                user.photoFileId = await getPhotoFileId(telegramId);
            }
            await user.save();
        }

        const [fullUser, settings] = await Promise.all([
            User.findById(user._id).populate('activeTools.tool'),
            Setting.findOneAndUpdate({ singleton: 'global_settings' }, {}, { upsert: true, new: true, setDefaultsOnInsert: true })
        ]);
        const token = generateToken(fullUser._id, fullUser.role, fullUser.username);
        const photoUrl = await getTemporaryPhotoUrl(fullUser.photoFileId) || PLACEHOLDER_AVATAR_URL;
        const userObject = fullUser.toObject();
        userObject.photoUrl = photoUrl;
        if (userObject.referredBy) {
            const referrerData = await User.findById(userObject.referredBy).select('telegramId');
            if (referrerData) userObject.referrerId = referrerData.telegramId;
        }

        console.log(`[Controller] -> /api/auth/sync: Proceso completado. Enviando respuesta 200 al cliente.`);
        res.status(200).json({ token, user: userObject, settings: settings || {} });

    } catch (error) {
        console.error('[Controller] -> /api/auth/sync: CATCH - Error fatal en el servidor.', error);
        res.status(500).json({ message: 'Error interno del servidor.', details: error.message });
    }
};

// --- FUNCIONES EXISTENTES (COMPLETAS) ---
const getUserProfile = async (req, res) => {
    try {
        const [user, settings] = await Promise.all([
            User.findById(req.user.id).populate('activeTools.tool'),
            Setting.findOne({ singleton: 'global_settings' })
        ]);
        if (!user) { return res.status(404).json({ message: 'Usuario no encontrado' }); }
        const userObject = user.toObject();
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
        const adminUser = await User.findOne({ $or: [{ username: username }, { telegramId: username }] }).select('+password');
        if (adminUser && adminUser.role === 'admin' && (await adminUser.matchPassword(password))) {
            const token = generateToken(adminUser._id, adminUser.role, adminUser.username);
            const photoUrl = await getTemporaryPhotoUrl(adminUser.photoFileId) || PLACEHOLDER_AVATAR_URL;
            res.json({ _id: adminUser._id, username: adminUser.username, role: adminUser.role, isTwoFactorEnabled: adminUser.isTwoFactorEnabled, token: token, photoUrl: photoUrl });
        } else {
            res.status(401).json({ message: 'Credenciales inválidas.' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error del servidor' });
    }
};

module.exports = { syncUser, getUserProfile, loginAdmin };