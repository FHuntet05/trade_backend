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

const authTelegramUser = async (req, res) => {
    const { initData, startParam } = req.body;
    if (!initData) { return res.status(400).json({ message: 'initData es requerido.' }); }
    try {
        await validate(initData, process.env.TELEGRAM_BOT_TOKEN, { expiresIn: 3600 });
        const parsedData = parse(initData);
        const userData = parsedData.user;
        if (!userData) { return res.status(401).json({ message: 'Información de usuario no encontrada.' }); }
        
        const telegramId = userData.id.toString();
        let user = await User.findOne({ telegramId });

        if (!user) {
            let referrer = null;
            if (startParam) {
                referrer = await User.findOne({ telegramId: startParam });
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
            await user.save();
            
            if (referrer) {
                referrer.referrals.push({ level: 1, user: user._id });
                await referrer.save();
            }
        } else {
            if (!user.photoFileId) {
                user.photoFileId = await getPhotoFileId(telegramId);
                if (user.photoFileId) await user.save();
            }
        }
        
        const [userWithTools, settings] = await Promise.all([
            User.findById(user._id).populate('activeTools.tool'),
            Setting.findOneAndUpdate({ singleton: 'global_settings' }, { $setOnInsert: { singleton: 'global_settings' } }, { upsert: true, new: true, setDefaultsOnInsert: true })
        ]);

        const userObject = userWithTools.toObject();
        // CORRECCIÓN: Obtenemos la URL de descarga directa de Telegram
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