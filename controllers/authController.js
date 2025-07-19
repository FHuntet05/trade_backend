// backend/controllers/authController.js (VERSIÓN RESTAURACIÓN FINAL v26.0)
const User = require('../models/userModel');
const Setting = require('../models/settingsModel');
const jwt = require('jsonwebtoken');
const { getTemporaryPhotoUrl } = require('./userController');

const PLACEHOLDER_AVATAR_URL = `${process.env.FRONTEND_URL}/assets/images/user-avatar-placeholder.png`;

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

const syncUser = async (req, res) => {
    const { telegramUser, refCode } = req.body;
    if (!telegramUser || !telegramUser.id) return res.status(400).json({ message: 'Telegram ID es requerido.' });
    
    const telegramId = telegramUser.id.toString();

    try {
        let user = await User.findOne({ telegramId });

        if (!user) {
            console.log(`[Sync] Usuario nuevo con ID: ${telegramId}. RefCode: '${refCode}'`);
            const username = telegramUser.username || `user_${telegramId}`;
            const fullName = `${telegramUser.first_name || ''} ${telegramUser.last_name || ''}`.trim();
            const newUser_data = { telegramId, username, fullName: fullName || username, language: telegramUser.language_code || 'es' };

            if (refCode && refCode !== 'null' && refCode !== 'undefined' && refCode !== telegramId) {
                const referrer = await User.findOne({ telegramId: refCode });
                if (referrer) {
                    console.log(`[Sync] Referente encontrado: ${referrer.username}`);
                    newUser_data.referredBy = referrer._id;
                    user = new User(newUser_data);
                    await user.save();
                    referrer.referrals.push({ level: 1, user: user._id });
                    await referrer.save();
                } else {
                    user = await User.create(newUser_data);
                }
            } else {
                user = await User.create(newUser_data);
            }
        }
        
        const userWithDetails = await User.findById(user._id).populate('activeTools.tool').populate('referredBy', 'username fullName');
        const settings = await Setting.findOne({ singleton: 'global_settings' }) || await Setting.create({ singleton: 'global_settings' });
        const userObject = userWithDetails.toObject();
        userObject.photoUrl = await getTemporaryPhotoUrl(userObject.photoFileId) || PLACEHOLDER_AVATAR_URL;
        const token = generateToken(user._id);

        res.status(200).json({ token, user: userObject, settings });

    } catch (error) {
        console.error('[Sync] ERROR FATAL:', error);
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