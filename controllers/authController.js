// backend/controllers/authController.js (VERSIÓN FLUJO DIRECTO v24.2 - CORRECCIÓN DE EXPORTACIÓN)
const User = require('../models/userModel');
const Setting = require('../models/settingsModel');
const jwt = require('jsonwebtoken');
const { getTemporaryPhotoUrl } = require('./userController');

const PLACEHOLDER_AVATAR_URL = `${process.env.FRONTEND_URL}/assets/images/user-avatar-placeholder.png`;

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

const validateUser = async (req, res) => {
    const { user: telegramUser } = req.body;
    if (!telegramUser || !telegramUser.id) {
        return res.status(400).json({ message: 'Datos de usuario de Telegram inválidos.' });
    }
    const telegramId = telegramUser.id.toString();

    try {
        let user = await User.findOne({ telegramId });
        let isNewUser = false;

        if (!user) {
            isNewUser = true;
            const username = telegramUser.username || `user_${telegramId}`;
            console.log(`[Validate] Usuario nuevo detectado: ${username} (${telegramId}). Creando...`);
            const fullName = `${telegramUser.first_name || ''} ${telegramUser.last_name || ''}`.trim();
            user = await User.create({
                telegramId, username, fullName: fullName || username,
                language: telegramUser.language_code || 'es',
            });
        } else {
            console.log(`[Validate] Usuario existente: ${user.username}.`);
        }
        
        const userWithDetails = await User.findById(user._id).populate('activeTools.tool').populate('referredBy', 'username fullName');
        const settings = await Setting.findOne({ singleton: 'global_settings' }) || await Setting.create({ singleton: 'global_settings' });
        const userObject = userWithDetails.toObject();
        userObject.photoUrl = await getTemporaryPhotoUrl(userObject.photoFileId) || PLACEHOLDER_AVATAR_URL;
        const token = generateToken(user._id);

        res.status(200).json({ token, user: userObject, settings, isNewUser });
    } catch (error) {
        console.error("Error catastrófico en validateUser:", error);
        res.status(500).json({ message: `Error interno del servidor: ${error.message}` });
    }
};

const getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate('activeTools.tool').populate('referredBy', 'username fullName');
        if (!user) { return res.status(404).json({ message: 'Usuario no encontrado' }); }
        const settings = await Setting.findOne({ singleton: 'global_settings' });
        const userObject = user.toObject();
        userObject.photoUrl = await getTemporaryPhotoUrl(userObject.photoFileId) || PLACEHOLDER_AVATAR_URL;
        res.json({ user: userObject, settings: settings || {} });
    } catch (error) {
        console.error("Error en getUserProfile:", error);
        res.status(500).json({ message: 'Error del servidor' });
    }
};

const loginAdmin = async (req, res) => {
    const { username, password } = req.body;
    try {
        const adminUser = await User.findOne({ $or: [{ username }, { telegramId: username }]}).select('+password');
        if (adminUser && adminUser.role === 'admin' && (await adminUser.matchPassword(password))) {
            const token = generateToken(adminUser._id);
            const photoUrl = await getTemporaryPhotoUrl(adminUser.photoFileId) || PLACEHOLDER_AVATAR_URL;
            res.json({ _id: adminUser._id, username: adminUser.username, role: adminUser.role, isTwoFactorEnabled: adminUser.isTwoFactorEnabled, token, photoUrl });
        } else {
            res.status(401).json({ message: 'Credenciales inválidas.' });
        }
    } catch (error) {
        console.error("Error en loginAdmin:", error);
        res.status(500).json({ message: 'Error del servidor' });
    }
};

// ======================= INICIO DE LA CORRECCIÓN DE EXPORTACIÓN =======================
module.exports = {
    validateUser,
    getUserProfile,
    loginAdmin // <-- ESTA ES LA LÍNEA QUE FALTABA
};
// ======================== FIN DE LA CORRECCIÓN DE EXPORTACIÓN =========================