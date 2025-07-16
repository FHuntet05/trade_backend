// backend/controllers/authController.js (VERSIÓN v15.0 - LÓGICA DE FOTOS CORREGIDA)
const User = require('../models/userModel');
const PendingReferral = require('../models/pendingReferralModel');
const Setting = require('../models/settingsModel');
const jwt = require('jsonwebtoken');
const { validate, parse } = require('@telegram-apps/init-data-node');
const axios = require('axios');

const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// --- FUNCIÓN CORREGIDA: Ahora obtiene el file_id PERMANENTE, no la URL temporal ---
const getPhotoFileId = async (userId) => {
    try {
        const response = await axios.get(`${TELEGRAM_API_URL}/getUserProfilePhotos`, {
            params: { user_id: userId, limit: 1 }
        });
        if (response.data.ok && response.data.result.photos.length > 0) {
            const photoArray = response.data.result.photos[0];
            // Devolver el file_id de la foto de mayor resolución
            return photoArray[photoArray.length - 1].file_id;
        }
    } catch (error) {
        console.error(`Error obteniendo el file_id de la foto de perfil para ${userId}:`, error.message);
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
                await PendingReferral.deleteOne({ _id: pendingReferral._id });
            }
            if (referrerTelegramId) {
                referrer = await User.findOne({ telegramId: referrerTelegramId });
            }
            
            // Obtenemos el file_id permanente
            const photoFileId = await getPhotoFileId(telegramId);
            const fullName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();

            user = new User({ 
                telegramId, 
                username: userData.username || `user_${telegramId}`,
                fullName: fullName || userData.username,
                language: userData.languageCode || 'es', 
                photoFileId: photoFileId, // Guardamos el file_id permanente
                referredBy: referrer ? referrer._id : null 
            });
            await user.save();
            
            if (referrer) {
                referrer.referrals.push({ level: 1, user: user._id });
                await referrer.save();
            }
        } else {
            // Lógica para actualizar datos si faltan (ej. si el usuario se une y luego pone foto)
            let needsUpdate = false;
            if (!user.photoFileId) {
                user.photoFileId = await getPhotoFileId(telegramId);
                if (user.photoFileId) needsUpdate = true;
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
        // Añadimos la URL dinámica para que el frontend la use
        userObject.photoUrl = `${process.env.BACKEND_URL}/api/users/${user.telegramId}/photo`;

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

        // Añadimos la URL dinámica para que el frontend la use
        userObject.photoUrl = `${process.env.BACKEND_URL}/api/users/${user.telegramId}/photo`;

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
            if (adminUser.isTwoFactorEnabled) {
                return res.json({ twoFactorRequired: true, userId: adminUser._id });
            }
            const sessionTokenPayload = { id: adminUser._id, role: adminUser.role, username: adminUser.username };
            const sessionToken = jwt.sign(sessionTokenPayload, process.env.JWT_SECRET, { expiresIn: '8h' });
            // Devolvemos la URL de la foto también para el admin
            const photoUrl = `${process.env.BACKEND_URL}/api/users/${adminUser.telegramId}/photo`;
            res.json({ _id: adminUser._id, username: adminUser.username, role: adminUser.role, isTwoFactorEnabled: adminUser.isTwoFactorEnabled, token: sessionToken, photoUrl });
        } else {
            res.status(401).json({ message: 'Credenciales inválidas.' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error del servidor' });
    }
};

module.exports = { authTelegramUser, getUserProfile, loginAdmin };