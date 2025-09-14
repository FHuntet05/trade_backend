// backend/controllers/authController.js (FASE "INSPECTIO" v1.0 - CORREGIDO)

const User = require('../models/userModel');
const Setting = require('../models/settingsModel');
const jwt = require('jsonwebtoken');
const { getTemporaryPhotoUrl } = require('./userController');

const PLACEHOLDER_AVATAR_URL = `${process.env.FRONTEND_URL}/assets/images/user-avatar-placeholder.png`;

// [INSPECTIO - CORRECCIÓN] Se crean dos generadores de tokens distintos.

/**
 * Genera un token para un usuario regular.
 * Usa el secreto JWT estándar.
 * @param {string} id El ID del usuario.
 * @returns {string} El token JWT.
 */
const generateUserToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

/**
 * Genera un token para un administrador.
 * Usa el secreto JWT de administrador, más seguro y aislado.
 * @param {string} id El ID del administrador.
 * @returns {string} El token JWT de administrador.
 */
const generateAdminToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_ADMIN_SECRET, { expiresIn: '1d' }); // Duración más corta por seguridad
};


/**
 * Sincroniza el usuario cuando la Mini App se abre.
 */
const syncUser = async (req, res) => {
    const { telegramUser } = req.body;
    
    console.log(`[Auth Sync] Petición de sincronización para el usuario: ${telegramUser?.id}`);
    
    if (!telegramUser || !telegramUser.id) {
        return res.status(400).json({ message: 'Datos de usuario de Telegram requeridos.' });
    }
    
    const telegramId = telegramUser.id.toString();

    try {
        let user = await User.findOne({ telegramId });

        if (!user) {
            console.warn(`[Auth Sync] ADVERTENCIA: El usuario ${telegramId} no existía. Creándolo sobre la marcha.`.yellow);
            const username = telegramUser.username || `user_${telegramId}`;
            const fullName = `${telegramUser.first_name || ''} ${telegramUser.last_name || ''}`.trim();
            user = new User({
                telegramId,
                username,
                fullName: fullName || username,
                language: telegramUser.language_code || 'es'
            });
            await user.save();
        } else {
            user.username = telegramUser.username || user.username;
            user.fullName = `${telegramUser.first_name || ''} ${telegramUser.last_name || ''}`.trim() || user.fullName;
            await user.save();
            console.log(`[Auth Sync] Usuario ${user.username} encontrado y actualizado.`);
        }
        
        const userWithDetails = await User.findById(user._id)
            .populate('activeTools.tool')
            .populate('referredBy', 'username fullName');

        const settings = await Setting.findOne({ singleton: 'global_settings' }) || await Setting.create({ singleton: 'global_settings' });
        
        const userObject = userWithDetails.toObject();
        userObject.photoUrl = await getTemporaryPhotoUrl(userObject.photoFileId) || PLACEHOLDER_AVATAR_URL;
        
        // Se usa el generador de tokens de usuario.
        const token = generateUserToken(user._id);

        console.log(`[Auth Sync] Sincronización exitosa para ${user.username}.`);
        res.status(200).json({ token, user: userObject, settings });

    } catch (error) {
        console.error('[Auth Sync] ERROR FATAL:'.red.bold, error);
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
        // Buscamos al admin y seleccionamos su contraseña para poder compararla.
        const adminUser = await User.findOne({ 
            $or: [{ username }, { telegramId: username }],
            role: 'admin' // Aseguramos que solo un admin pueda iniciar sesión aquí.
        }).select('+password');

        if (adminUser && (await adminUser.matchPassword(password))) {
            
            // [INSPECTIO - CORRECCIÓN] Usamos el generador de tokens específico para administradores.
            const token = generateAdminToken(adminUser._id);
            
            // [INSPECTIO - CORRECCIÓN] Devolvemos el objeto 'admin' completo, no campos sueltos.
            // Esto es crucial para que el frontend obtenga el 'telegramId'.
            const adminData = adminUser.toObject();
            delete adminData.password; // Eliminar la contraseña del objeto antes de enviarlo.

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