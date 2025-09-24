// RUTA: backend/controllers/authController.js (VERSIÓN "NEXUS - DIAGNOSTIC INSTRUMENTATION")

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
            return res.status(503).json({ 
                message: settings.maintenanceMessage || 'El sistema está en mantenimiento. Por favor, inténtelo más tarde.' 
            });
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
                
                user.activeTools.push({
                    tool: freeTool._id,
                    purchaseDate: now,
                    expiryDate: expiryDate,
                });
                
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

        res.status(200).json({ 
            token, 
            user: userObject, 
            settings: settings || {}
        });

    } catch (error) => {
        console.error('[Auth Sync] ERROR FATAL:'.red.bold, error);
        return res.status(500).json({ message: 'Error interno del servidor.', details: error.message });
    }
};

const getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate('referredBy', 'username fullName');
        if (!user) { return res.status(404).json({ message: 'Usuario no encontrado' }); }
        
        const settings = await Setting.findOne({ singleton: 'global_settings' });
        
        const userObject = user.toObject();

        delete userObject.transactions;

        res.json({ user: userObject, settings: settings || {} });

    } catch (error) { res.status(500).json({ message: 'Error del servidor' }); }
};

// ======================= INICIO DE LA INSTRUMENTACIÓN DE DIAGNÓSTICO =======================
const loginAdmin = async (req, res) => {
    const { username, password } = req.body;
    
    // LOG 1: Inicio de la función.
    console.log(`[DIAGNÓSTICO LOGIN 1/5] Intento de login para usuario: '${username}'`);

    try {
        // LOG 2: Justo antes de la consulta a la base de datos.
        console.log(`[DIAGNÓSTICO LOGIN 2/5] Ejecutando User.findOne con rol 'admin' para '${username}'`);
        
        const adminUser = await User.findOne({ 
            $or: [{ username }, { telegramId: username }],
            role: 'admin'
        }).select('+password'); // Seleccionamos la contraseña para la comparación.

        // LOG 3: Resultado de la consulta.
        if (adminUser) {
            console.log(`[DIAGNÓSTICO LOGIN 3/5] Usuario encontrado en la BD. ID: ${adminUser._id}. Procediendo a comparar contraseñas.`);
        } else {
            console.log(`[DIAGNÓSTICO LOGIN 3/5] User.findOne devolvió NULL. Ningún usuario con rol 'admin' coincide con '${username}'.`);
        }
        
        // LOG 4: Evaluación de la condición completa.
        if (adminUser && (await adminUser.matchPassword(password))) {
            console.log(`[DIAGNÓSTICO LOGIN 4/5] ÉXITO. Contraseña coincide. Generando token.`);
            const token = generateAdminToken(adminUser._id);
            const adminData = adminUser.toObject();
            delete adminData.password;

            res.json({
                token,
                admin: adminData
            });
        } else {
            console.log(`[DIAGNÓSTICO LOGIN 4/5] FALLO. Usuario no encontrado o contraseña no coincide. Enviando error 401.`);
            res.status(401).json({ message: 'Credenciales inválidas.' });
        }
    } catch (error) {
        // LOG 5: Captura de cualquier error inesperado en el proceso.
        console.error(`[DIAGNÓSTICO LOGIN 5/5] ERROR INESPERADO en el bloque try...catch:`, error);
        res.status(500).json({ message: 'Error crítico del servidor durante el login.' });
    }
};
// ======================== FIN DE LA INSTRUMENTACIÓN DE DIAGNÓSTICO =========================

module.exports = { syncUser, getUserProfile, loginAdmin };