// backend/controllers/authController.js (VERSIÓN FINAL, COMPLETA Y MEJORADA)
const User = require('../models/userModel');
const PendingReferral = require('../models/pendingReferralModel');
const Setting = require('../models/settingsModel');
const jwt = require('jsonwebtoken');
const { validate, parse } = require('@telegram-apps/init-data-node');
const axios = require('axios'); // Asegúrate de tener axios instalado: npm install axios
const speakeasy = require('speakeasy'); // Mantenemos esta importación por si la usas en otra parte

const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// --- Función para obtener la URL de la foto de perfil de alta calidad ---
const getHighResPhotoUrl = async (userId) => {
    try {
        const response = await axios.get(`${TELEGRAM_API_URL}/getUserProfilePhotos`, {
            params: { user_id: userId, limit: 1 }
        });
        if (response.data.ok && response.data.result.photos.length > 0) {
            const photoArray = response.data.result.photos[0];
            const bestPhoto = photoArray[photoArray.length - 1];
            const fileResponse = await axios.get(`${TELEGRAM_API_URL}/getFile`, {
                params: { file_id: bestPhoto.file_id }
            });
            if (fileResponse.data.ok) {
                return `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileResponse.data.result.file_path}`;
            }
        }
    } catch (error) {
        console.error(`Error obteniendo foto de perfil para ${userId}:`, error.message);
    }
    return null;
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
        if (!userData) { return res.status(401).json({ message: 'Información de usuario no encontrada en initData.' }); }
        
        const telegramId = userData.id.toString();
        let user = await User.findOne({ telegramId });

        if (!user) {
            let referrer = null;
            let referrerTelegramId = startParam;
            const pendingReferral = await PendingReferral.findOne({ newUserId: telegramId });
            if (pendingReferral) {
                referrerTelegramId = pendingReferral.referrerId;
            }
            if (referrerTelegramId) {
                referrer = await User.findOne({ telegramId: referrerTelegramId });
            }
            
            const photoUrl = await getHighResPhotoUrl(telegramId);
            const fullName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();

            user = new User({ 
                telegramId, 
                username: userData.username || `user_${telegramId}`,
                fullName: fullName || userData.username,
                language: userData.languageCode || 'es', 
                photoUrl: photoUrl || userData.photoUrl,
                referredBy: referrer ? referrer._id : null 
            });
            await user.save();
            
            if (referrer) {
                referrer.referrals.push({ level: 1, user: user._id });
                await referrer.save();
                if (pendingReferral) { await PendingReferral.deleteOne({ _id: pendingReferral._id }); }
            }
        } else {
            let needsUpdate = false;
            if (!user.photoUrl) {
                user.photoUrl = await getHighResPhotoUrl(telegramId);
                if (user.photoUrl) needsUpdate = true;
            }
            if (!user.fullName || user.fullName === user.username) {
                const newFullName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();
                if (newFullName) {
                    user.fullName = newFullName;
                    needsUpdate = true;
                }
            }
            if (needsUpdate) await user.save();
        }
        
        const [userWithTools, settings] = await Promise.all([
            User.findById(user._id).populate('activeTools.tool'),
            Setting.findOneAndUpdate({ singleton: 'global_settings' }, { $setOnInsert: { singleton: 'global_settings' } }, { upsert: true, new: true, setDefaultsOnInsert: true })
        ]);
        const userObject = userWithTools.toObject();
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
            User.findById(req.user.id).populate('activeTools.tool'), // Corregido: req.user.id en lugar de req.user._id por consistencia
            Setting.findOneAndUpdate({ singleton: 'global_settings' }, { $setOnInsert: { singleton: 'global_settings' } }, { upsert: true, new: true, setDefaultsOnInsert: true })
        ]);
        if (!user) { return res.status(404).json({ message: 'Usuario no encontrado' }); }
        const userObject = user.toObject();
        if (userObject.referredBy) {
            const referrerData = await User.findById(userObject.referredBy).select('telegramId');
            if (referrerData) userObject.referrerId = referrerData.telegramId;
        }
        res.json({ user: userObject, settings });
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
            if (adminUser.isTwoFactorEnabled) {
                return res.json({ twoFactorRequired: true, userId: adminUser._id });
            }
            const sessionTokenPayload = { id: adminUser._id, role: adminUser.role, username: adminUser.username };
            const sessionToken = jwt.sign(sessionTokenPayload, process.env.JWT_SECRET, { expiresIn: '8h' });
            res.json({ _id: adminUser._id, username: adminUser.username, role: adminUser.role, isTwoFactorEnabled: adminUser.isTwoFactorEnabled, token: sessionToken });
        } else {
            res.status(401).json({ message: 'Credenciales inválidas.' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error del servidor' });
    }
};

module.exports = { authTelegramUser, getUserProfile, loginAdmin };