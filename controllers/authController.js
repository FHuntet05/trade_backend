// backend/controllers/authController.js (VERSIÓN CON REFERIDOS BLINDADOS v24.0)
const User = require('../models/userModel');
const Setting = require('../models/settingsModel');
const jwt = require('jsonwebtoken');
const { getTemporaryPhotoUrl } = require('./userController');

const PLACEHOLDER_AVATAR_URL = `${process.env.FRONTEND_URL}/assets/images/user-avatar-placeholder.png`;

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

const syncUser = async (req, res) => {
    const { user: telegramUser, refCode } = req.body;
    if (!telegramUser || !telegramUser.id) {
        return res.status(400).json({ message: 'Datos de usuario de Telegram inválidos.' });
    }
    const telegramId = telegramUser.id.toString();

    try {
        let user = await User.findOne({ telegramId });
        
        if (!user) {
            console.log(`[Sync] Usuario nuevo detectado: ${telegramUser.username} (${telegramId}). Creando...`);
            let referrer = null;
            if (refCode && refCode !== telegramId) {
                referrer = await User.findOne({ telegramId: refCode });
                if (referrer) {
                    console.log(`[Sync] Referente encontrado: ${referrer.username} (${refCode})`);
                } else {
                    console.warn(`[Sync] Código de referido (${refCode}) no corresponde a ningún usuario.`);
                }
            }
            const fullName = `${telegramUser.first_name || ''} ${telegramUser.last_name || ''}`.trim();
            user = await User.create({
                telegramId,
                username: telegramUser.username || `user_${telegramId}`,
                fullName: fullName || telegramUser.username,
                language: telegramUser.language_code || 'es',
                referredBy: referrer ? referrer._id : null
            });
            if (referrer) {
                referrer.referrals.push({ level: 1, user: user._id });
                await referrer.save();
                console.log(`[Sync] Usuario ${user.username} añadido a la lista de referidos de ${referrer.username}.`);
            }
        } else {
             console.log(`[Sync] Usuario existente: ${user.username}.`);
             user.username = telegramUser.username || user.username;
             await user.save();
        }

        // ======================= INICIO DE LA CORRECCIÓN DE REFERIDOS =======================
        // Poblamos las herramientas Y TAMBIÉN el referente para enviar sus datos al frontend.
        const userWithDetails = await User.findById(user._id)
            .populate('activeTools.tool')
            .populate('referredBy', 'username fullName'); // <-- ¡LA REPARACIÓN CRÍTICA!
        // ======================== FIN DE LA CORRECCIÓN DE REFERIDOS =========================

        const settings = await Setting.findOne({ singleton: 'global_settings' }) || await Setting.create({ singleton: 'global_settings' });
        const userObject = userWithDetails.toObject();
        userObject.photoUrl = await getTemporaryPhotoUrl(userObject.photoFileId) || PLACEHOLDER_AVATAR_URL;
        const token = generateToken(user._id);

        res.status(200).json({
            token,
            user: userObject,
            settings
        });

    } catch (error) {
        console.error("Error catastrófico en syncUser:", error);
        res.status(500).json({ message: `Error interno del servidor: ${error.message}` });
    }
};

// --- El resto del archivo (getUserProfile, loginAdmin, exports) permanece igual ---
const getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate('activeTools.tool').populate('referredBy', 'username fullName');
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }
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

module.exports = {
    syncUser,
    getUserProfile,
    loginAdmin
};