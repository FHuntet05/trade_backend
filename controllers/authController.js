// backend/controllers/authController.js (VERSIÓN TIERRA QUEMADA v29.0 - FINAL)
const User = require('../models/userModel');
const Setting = require('../models/settingsModel');
const jwt = require('jsonwebtoken');
const { getTemporaryPhotoUrl } = require('./userController');

const PLACEHOLDER_AVATAR_URL = `${process.env.FRONTEND_URL}/assets/images/user-avatar-placeholder.png`;

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

const syncUser = async (req, res) => {
     // ======================= LÍNEA DE AUTOPSIA =======================
    console.log('--- AUTOPSIA: DATOS RECIBIDOS EN EL CONTROLADOR ---');
    console.log('req.body:', JSON.stringify(req.body, null, 2));
    console.log('--------------------------------------------------');
    // ===============================================================
    const { telegramUser, refCode } = req.body;
    if (!telegramUser || !telegramUser.id) return res.status(400).json({ message: 'Telegram ID es requerido.' });
    
    const telegramId = telegramUser.id.toString();

    try {
        let user = await User.findOne({ telegramId });
        let referrer = null;

        // Buscamos al referente ANTES, si hay un refCode.
        if (refCode && refCode !== 'null' && refCode !== 'undefined' && refCode !== telegramId) {
            referrer = await User.findOne({ telegramId: refCode });
        }

        if (!user) {
            // FLUJO DE USUARIO NUEVO
            console.log(`[Sync-Final] Usuario nuevo con ID: ${telegramId}.`);
            const username = telegramUser.username || `user_${telegramId}`;
            const fullName = `${telegramUser.first_name || ''} ${telegramUser.last_name || ''}`.trim();
            const newUser_data = { telegramId, username, fullName: fullName || username, language: telegramUser.language_code || 'es' };

            if (referrer) {
                console.log(`[Sync-Final] Asignando referente ${referrer.username} al nuevo usuario.`);
                newUser_data.referredBy = referrer._id;
            }
            
            user = new User(newUser_data);
            await user.save();

            if (referrer) {
                referrer.referrals.push({ level: 1, user: user._id });
                await referrer.save();
            }

        } else {
            // FLUJO DE USUARIO EXISTENTE
            // ESTA ES LA REPARACIÓN CRÍTICA: si el usuario existe pero no tiene referente, y nos llega uno, lo asignamos.
            if (referrer && !user.referredBy) {
                console.log(`[Sync-Final] Usuario existente sin referente. Asignando referente: ${referrer.username}`);
                user.referredBy = referrer._id;
                await user.save();
                
                referrer.referrals.push({ level: 1, user: user._id });
                await referrer.save();
            } else {
                console.log(`[Sync-Final] Usuario existente encontrado: ${user.username}. No se requieren cambios de referido.`);
            }
        }
        
        // El resto del flujo para devolver los datos completos
        const userWithDetails = await User.findById(user._id).populate('activeTools.tool').populate('referredBy', 'username fullName');
        const settings = await Setting.findOne({ singleton: 'global_settings' }) || await Setting.create({ singleton: 'global_settings' });
        const userObject = userWithDetails.toObject();
        userObject.photoUrl = await getTemporaryPhotoUrl(userObject.photoFileId) || PLACEHOLDER_AVATAR_URL;
        const token = generateToken(user._id);

        res.status(200).json({ token, user: userObject, settings });

    } catch (error) {
        console.error('[Sync-Final] ERROR FATAL:', error);
        return res.status(500).json({ message: 'Error interno del servidor.', details: error.message });
    }
};

const getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate('activeTools.tool').populate('referredBy', 'username fullName');
        if (!user) { return res.status(404).json({ message: 'Usuario no encontrado' }); }
        const settings = await Setting.findOne({ singleton: 'global_settings' });
        res.json({ user: user.toObject(), settings: settings || {} });
    } catch (error) { res.status(500).json({ message: 'Error del servidor' }); }
};

const loginAdmin = async (req, res) => {
    const { username, password } = req.body;
    try {
        const adminUser = await User.findOne({ $or: [{ username }, { telegramId: username }]}).select('+password');
        if (adminUser && adminUser.role === 'admin' && (await adminUser.matchPassword(password))) {
            const token = generateToken(adminUser._id);
            res.json({ _id: adminUser._id, username: adminUser.username, role: adminUser.role, isTwoFactorEnabled: adminUser.isTwoFactorEnabled, token });
        } else {
            res.status(401).json({ message: 'Credenciales inválidas.' });
        }
    } catch (error) { res.status(500).json({ message: 'Error del servidor' }); }
};

module.exports = { syncUser, getUserProfile, loginAdmin };