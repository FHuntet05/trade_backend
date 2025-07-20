// backend/controllers/authController.js (VERSIÓN REFERIDO INSTANTÁNEO v30.0)

const User = require('../models/userModel');
const Setting = require('../models/settingsModel');
const jwt = require('jsonwebtoken');
// Asumimos que userController existe y tiene esta función. Si no, debe ser creada o eliminada la llamada.
const { getTemporaryPhotoUrl } = require('./userController'); 

const PLACEHOLDER_AVATAR_URL = `${process.env.FRONTEND_URL}/assets/images/user-avatar-placeholder.png`;

// Generador de token (sin cambios)
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

/**
 * Sincroniza el usuario cuando la Mini App se abre.
 * NO maneja la lógica de referidos; esta ya fue procesada por el bot.
 * Su objetivo es autenticar al usuario y devolverle su estado completo.
 */
const syncUser = async (req, res) => {
    // Ya no se espera un `refCode` en el cuerpo de la petición.
    const { telegramUser } = req.body;
    
    console.log(`[Auth Sync] Petición de sincronización para el usuario: ${telegramUser?.id}`);
    
    if (!telegramUser || !telegramUser.id) {
        return res.status(400).json({ message: 'Datos de usuario de Telegram requeridos.' });
    }
    
    const telegramId = telegramUser.id.toString();

    try {
        let user = await User.findOne({ telegramId });

        // Caso de seguridad: si el usuario por alguna razón no fue creado por el bot, lo creamos aquí.
        // Esto previene un crash en la app si el usuario abre la app sin haber usado /start.
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
            // Opcional: Podríamos actualizar datos como el nombre de usuario o el nombre completo si han cambiado.
            user.username = telegramUser.username || user.username;
            user.fullName = `${telegramUser.first_name || ''} ${telegramUser.last_name || ''}`.trim() || user.fullName;
            await user.save();
            console.log(`[Auth Sync] Usuario ${user.username} encontrado y actualizado.`);
        }
        
        // Obtenemos los datos completos del usuario para enviarlos al frontend.
        // El `populate` es crucial para obtener la información de las herramientas y el referente.
        const userWithDetails = await User.findById(user._id)
            .populate('activeTools.tool')
            .populate('referredBy', 'username fullName'); // Traemos username y fullName del referente.

        // Obtenemos la configuración global del sistema.
        const settings = await Setting.findOne({ singleton: 'global_settings' }) || await Setting.create({ singleton: 'global_settings' });
        
        const userObject = userWithDetails.toObject();
        // Asignamos la URL de la foto de perfil.
        userObject.photoUrl = await getTemporaryPhotoUrl(userObject.photoFileId) || PLACEHOLDER_AVATAR_URL;
        
        // Generamos un token de autenticación para el frontend.
        const token = generateToken(user._id);

        console.log(`[Auth Sync] Sincronización exitosa para ${user.username}.`);
        res.status(200).json({ token, user: userObject, settings });

    } catch (error) {
        console.error('[Auth Sync] ERROR FATAL:'.red.bold, error);
        return res.status(500).json({ message: 'Error interno del servidor.', details: error.message });
    }
};

// --- OTRAS FUNCIONES DE AUTENTICACIÓN (sin cambios) ---

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