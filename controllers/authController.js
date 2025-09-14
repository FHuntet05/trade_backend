// backend/controllers/authController.js (FASE "REMEDIATIO" - CORRECCIÓN DE POPULATE)

const User = require('../models/userModel');
const Setting = require('../models/settingsModel');
const jwt = require('jsonwebtoken');
const { getTemporaryPhotoUrl } = require('./userController');

// [REMEDIATIO - CORRECCIÓN] La variable de entorno correcta es CLIENT_URL
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
        // [REMEDIATIO - OPTIMIZACIÓN Y CORRECCIÓN]
        // Usamos findOneAndUpdate con la opción { new: true, upsert: true }
        // Esto busca al usuario. Si no existe, lo crea. Si existe, lo actualiza.
        // Todo en una sola operación atómica en la base de datos.
        // También populamos 'referredBy' directamente en esta consulta.
        const user = await User.findOneAndUpdate(
            { telegramId: telegramId },
            { 
                $set: {
                    username: telegramUser.username || `user_${telegramId}`,
                    fullName: `${telegramUser.first_name || ''} ${telegramUser.last_name || ''}`.trim() || `user_${telegramId}`,
                    language: telegramUser.language_code || 'es'
                },
                $setOnInsert: { // Estos valores solo se establecen si el usuario es nuevo (upsert)
                    telegramId: telegramId,
                }
            },
            { new: true, upsert: true }
        ).populate('referredBy', 'username fullName');

        if (!user) {
            // Este caso es muy improbable con upsert: true, pero es una buena práctica de seguridad.
            console.error('[Auth Sync] ERROR: No se pudo crear o encontrar al usuario.'.red.bold);
            return res.status(500).json({ message: 'No se pudo procesar el perfil de usuario.' });
        }
        
        console.log(`[Auth Sync] Usuario ${user.username} sincronizado/creado exitosamente.`);

        // [REMEDIATIO - CORRECCIÓN]
        // Se elimina la siguiente línea que causaba el error 500 porque el campo 'activeTools'
        // no existe en el userModel.
        // const userWithDetails = await User.findById(user._id).populate('activeTools.tool').populate('referredBy', 'username fullName');
        
        const settings = await Setting.findOne({ singleton: 'global_settings' }) || await Setting.create({ singleton: 'global_settings' });
        
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
        // [REMEDIATIO - CORRECCIÓN] Se elimina el populate de 'activeTools.tool' que no existe.
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
        }).select('+password');

        if (adminUser && (await adminUser.matchPassword(password))) {
            const token = generateAdminToken(adminUser._id);
            const adminData = adminUser.toObject();
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