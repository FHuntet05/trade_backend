// RUTA: backend/controllers/authController.js
// --- VERSIÓN DE DEBUGGING CON CONSOLE.LOGS PARA EL LOGIN DE ADMIN ---

const User = require('../models/userModel');
const Setting = require('../models/settingsModel');
const Tool = require('../models/toolModel');
const jwt = require('jsonwebtoken');
const { getTemporaryPhotoUrl } = require('./userController');

const PLACEHOLDER_AVATAR_URL = `${process.env.CLIENT_URL}/assets/images/user-avatar-placeholder.png`;

const generateUserToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

const generateAdminToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_ADMIN_SECRET, { expiresIn: '1d' });
};

const syncUser = async (req, res) => {
    const { telegramUser } = req.body;
    
    if (!telegramUser || !telegramUser.id) {
        return res.status(400).json({ message: 'Datos de usuario de Telegram requeridos.' });
    }
    
    try {
        const settings = await Setting.findOne({ singleton: 'global_settings' }).lean();

        if (settings && settings.maintenanceMode) {
            return res.status(503).json({ message: settings.maintenanceMessage || 'El sistema está en mantenimiento.' });
        }

        const telegramId = telegramUser.id.toString();
        let user = await User.findOne({ telegramId: telegramId });
        
        if (!user) {
            user = new User({
                telegramId: telegramId,
                username: telegramUser.username || `user_${telegramId}`,
                fullName: `${telegramUser.first_name || ''} ${telegramUser.last_name || ''}`.trim() || `user_${telegramId}`,
                language: telegramUser.language_code || 'es'
            });
        }

        if (user.activeTools.length === 0) {
            const freeTool = await Tool.findOne({ isFree: true }).lean();
            if (freeTool) {
                const now = new Date();
                const expiryDate = new Date(now.getTime() + freeTool.durationDays * 24 * 60 * 60 * 1000);
                user.activeTools.push({ tool: freeTool._id, purchaseDate: now, expiryDate: expiryDate });
                user.effectiveMiningRate = freeTool.miningBoost;
                user.miningStatus = 'IDLE';
                user.lastMiningClaim = now;
            }
        }
        
        user.username = telegramUser.username || user.username;
        user.fullName = `${telegramUser.first_name || ''} ${telegramUser.last_name || ''}`.trim() || user.fullName;
        user.language = telegramUser.language_code || user.language;
        
        await user.save();
        await user.populate('referredBy', 'username fullName');
        
        const userObject = user.toObject();
        userObject.photoUrl = await getTemporaryPhotoUrl(userObject.photoFileId) || PLACEHOLDER_AVATAR_URL;
        
        delete userObject.transactions;
        const token = generateUserToken(user._id);
        res.status(200).json({ token, user: userObject, settings: settings || {} });
    } catch (error) {
        console.error('[Auth Sync] ERROR FATAL:', error);
        return res.status(500).json({ message: 'Error interno del servidor.', details: error.message });
    }
};

const getUserProfile = async (req, res) => {
    if (req.user) {
        res.json(req.user);
    } else {
        res.status(404).json({ message: "Usuario no encontrado." });
    }
};

const loginAdmin = async (req, res) => {
    const { username, password } = req.body || {};
    
    console.log('\n--- [ADMIN LOGIN DEBUG] ---');
    
    if (!username || !password) {
        console.log('[DEBUG 1] FALLO: Petición mal formada. Faltan credenciales.');
        return res.status(400).json({ message: 'Petición mal formada. Faltan credenciales.' });
    }

    console.log(`[DEBUG 1] Intento de login para usuario: '${username}'`);

    try {
        const adminUser = await User.findOne({ 
            $or: [{ username }, { telegramId: username }],
            role: 'admin'
        }).select('+password');

        console.log('[DEBUG 2] Resultado de la búsqueda en la base de datos:', adminUser ? `Usuario encontrado: ${adminUser.username}` : 'Usuario NO encontrado.');

        if (adminUser && (await adminUser.matchPassword(password))) {
            console.log('[DEBUG 3] ÉXITO: La contraseña coincide. Generando token.');
            const token = generateAdminToken(adminUser._id);
            const adminData = adminUser.toObject();
            delete adminData.password;

            res.json({
                token,
                admin: adminData
            });
        } else {
            console.log('[DEBUG 3] FALLO: Credenciales inválidas. Enviando error 401.');
            res.status(401).json({ message: 'Credenciales inválidas.' });
        }
    } catch (error) {
        console.error(`[ADMIN LOGIN DEBUG] ERROR CRÍTICO INESPERADO:`, error);
        res.status(500).json({ message: 'Error crítico del servidor durante el login.' });
    }
};

module.exports = { syncUser, getUserProfile, loginAdmin };