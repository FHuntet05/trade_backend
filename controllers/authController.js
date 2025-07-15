// backend/controllers/authController.js (VERSIÓN TEMPORAL PARA ASIGNAR ADMIN)
const User = require('../models/userModel');
const PendingReferral = require('../models/pendingReferralModel');
const Setting = require('../models/settingsModel');
const jwt = require('jsonwebtoken');
const { validate, parse } = require('@telegram-apps/init-data-node');
const speakeasy = require('speakeasy');

// ... (generateToken no cambia)
const generateToken = (id, role, username) => {
    const payload = { id, role, username };
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
};

const authTelegramUser = async (req, res) => {
    // ... (toda la lógica de autenticación hasta encontrar o crear el usuario es la misma) ...
    const { initData, startParam } = req.body;
    if (!initData) { return res.status(400).json({ message: 'initData es requerido.' }); }
    try {
        await validate(initData, process.env.TELEGRAM_BOT_TOKEN, { expiresIn: 3600 });
        const parsedData = parse(initData);
        const userData = parsedData.user;
        if (!userData) { return res.status(401).json({ message: 'Información de usuario no encontrada en initData.' }); }
        
        const telegramId = userData.id.toString();
        const username = userData.username || `user_${telegramId}`;
        let user = await User.findOne({ telegramId });

        if (!user) {
            // ... (lógica de creación de referido no cambia)
            let referrer = null;
            let referrerTelegramId = startParam;
            const pendingReferral = await PendingReferral.findOne({ newUserId: telegramId });
            if (pendingReferral) {
                referrerTelegramId = pendingReferral.referrerId;
            }
            if (referrerTelegramId) {
                referrer = await User.findOne({ telegramId: referrerTelegramId });
            }
            user = new User({
                telegramId,
                username,
                language: userData.languageCode || 'es',
                photoUrl: userData.photoUrl || null,
                referredBy: referrer ? referrer._id : null,
            });
            await user.save();
            if (referrer) {
                referrer.referrals.push({ level: 1, user: user._id });
                await referrer.save();
                if (pendingReferral) {
                    await PendingReferral.deleteOne({ _id: pendingReferral._id });
                }
            }
        }
        
        // --- CÓDIGO TEMPORAL PARA ASIGNARTE COMO ADMIN ---
        // Comprueba si el ID de Telegram que inicia sesión es el tuyo.
        if (user.telegramId === '1601545124' && user.role !== 'admin') {
            user.role = 'admin';
            await user.save();
            console.log(`✅ ROL DE ADMINISTRADOR ASIGNADO a usuario con ID de Telegram: 1601545124`);
        }
        // --- FIN DEL CÓDIGO TEMPORAL ---

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
        res.status(401).json({ message: `Autenticación fallida: ${error.message}` });
    }
};

// ... (getUserProfile y loginAdmin permanecen como estaban en la versión completa y correcta) ...
const getUserProfile = async (req, res) => {
    try {
        const [user, settings] = await Promise.all([
            User.findById(req.user._id).populate('activeTools.tool'),
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
    if (!username || !password) { return res.status(400).json({ message: 'Por favor, ingrese usuario y contraseña.' }); }
    try {
        const adminUser = await User.findOne({ username }).select('+password');
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