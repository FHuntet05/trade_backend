// RUTA: backend/controllers/authController.js (VERSIÓN COMPLETA "NEXUS - DIAGNOSTIC FIX")

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
    
    console.log(`[Auth Sync] Petición de sincronización para el usuario: ${telegramUser?.id}`);
    
    if (!telegramUser || !telegramUser.id) {
        return res.status(400).json({ message: 'Datos de usuario de Telegram requeridos.' });
    }
    
    const telegramId = telegramUser.id.toString();

    try {
        let isNewUser = false;
        let user = await User.findOne({ telegramId: telegramId });
        
        if (!user) {
            isNewUser = true;
            console.log(`[Auth Sync] Usuario ${telegramId} no encontrado. Creando nuevo perfil.`);
            user = new User({
                telegramId: telegramId,
                username: telegramUser.username || `user_${telegramId}`,
                fullName: `${telegramUser.first_name || ''} ${telegramUser.last_name || ''}`.trim() || `user_${telegramId}`,
                language: telegramUser.language_code || 'es'
            });
        } else {
             user.username = telegramUser.username || user.username;
             user.fullName = `${telegramUser.first_name || ''} ${telegramUser.last_name || ''}`.trim() || user.fullName;
             user.language = telegramUser.language_code || user.language;
        }

        if (isNewUser) {
            const freeTool = await Tool.findOne({ isFree: true }).lean();
            if (freeTool) {
                console.log(`[Auth Sync] Fábrica gratuita encontrada: "${freeTool.name}". Asignando al nuevo usuario.`);
                const now = new Date();
                const expiryDate = new Date(now.getTime() + freeTool.durationDays * 24 * 60 * 60 * 1000);
                
                user.activeTools.push({
                    tool: freeTool._id,
                    purchaseDate: now,
                    expiryDate: expiryDate,
                });
                
                user.effectiveMiningRate = (user.effectiveMiningRate || 0) + freeTool.miningBoost;
                
                user.miningStatus = 'IDLE'; 
                user.lastMiningClaim = now;
            } else {
                console.log('[Auth Sync] No se encontró una fábrica gratuita configurada en el sistema.');
            }
        }
        
        await user.save();
        await user.populate('referredBy', 'username fullName');
        
        console.log(`[Auth Sync] Usuario ${user.username} sincronizado/creado exitosamente.`);

        const settings = await Setting.findOne({ singleton: 'global_settings' }) || await Setting.create({});
        
        const userObject = user.toObject();
        userObject.photoUrl = await getTemporaryPhotoUrl(userObject.photoFileId) || PLACEHOLDER_AVATAR_URL;
        
        const token = generateUserToken(user._id);

        console.log(`[Auth Sync] Sincronización completada para ${user.username}.`);
        res.status(200).json({ token, user: userObject, settings });

    } catch (error) {
        console.error('[Auth Sync] ERROR FATAL:'.red.bold, error);
        return res.status(500).json({ message: 'Error interno del servidor.', details: error.message });
    }
};

const getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate('referredBy', 'username fullName');
        if (!user) { return res.status(404).json({ message: 'Usuario no encontrado' }); }
        const settings = await Setting.findOne({ singleton: 'global_settings' });
        res.json({ user: user.toObject(), settings: settings || {} });
    } catch (error) { res.status(500).json({ message: 'Error del servidor' }); }
};

const loginAdmin = async (req, res) => {
    const { username, password } = req.body;
    try {
        const adminUser = await User.findOne({ 
            $or: [{ username }, { telegramId: username }],
            role: 'admin'
        }).select('+password username role telegramId');

        if (adminUser && (await adminUser.matchPassword(password))) {
            const token = generateAdminToken(adminUser._id);
            
            const adminData = adminUser.toObject({ getters: true, virtuals: true });
            delete adminData.password;

            res.json({
                token,
                admin: adminData
            });
        } else {
            res.status(401).json({ message: 'Credenciales inválidas.' });
        }
    } catch (error) {
        console.error(`[Admin Login] Error: ${error.message}`);
        res.status(500).json({ message: 'Error del servidor' });
    }
};

module.exports = { syncUser, getUserProfile, loginAdmin };