// backend/controllers/authController.js (VERSIÓN FINAL v32.0 - SIMPLIFICADA)

const User = require('../models/userModel');
const Setting = require('../models/settingsModel');
const jwt = require('jsonwebtoken');
const { getTemporaryPhotoUrl } = require('./userController'); // Asegúrese de que este import es correcto

const PLACEHOLDER_AVATAR_URL = `${process.env.FRONTEND_URL}/assets/images/user-avatar-placeholder.png`;

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

/**
 * Sincroniza el usuario cuando la Mini App se abre.
 * NO maneja la lógica de referidos. Su única misión es autenticar al usuario
 * y devolverle su estado completo desde la base de datos.
 */
const syncUser = async (req, res) => {
    // La petición ya no contiene 'refCode'.
    const { telegramUser } = req.body;
    
    console.log(`[Auth Sync] Petición de sincronización para el usuario: ${telegramUser?.id}`);
    
    if (!telegramUser || !telegramUser.id) {
        return res.status(400).json({ message: 'Datos de usuario de Telegram requeridos.' });
    }
    
    const telegramId = telegramUser.id.toString();

    try {
        // La única responsabilidad de esta función es encontrar al usuario.
        // Se asume que el comando /start del bot ya lo ha creado.
        let user = await User.findOne({ telegramId });

        // Caso de seguridad: si el usuario no existe (p. ej., borró la BD y no usó /start).
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
             // Opcional: Actualizamos datos que pueden cambiar, como el nombre de usuario.
            user.username = telegramUser.username || user.username;
            user.fullName = `${telegramUser.first_name || ''} ${telegramUser.last_name || ''}`.trim() || user.fullName;
            await user.save();
            console.log(`[Auth Sync] Usuario ${user.username} encontrado y actualizado.`);
        }
        
        // Obtenemos los datos completos del usuario, incluyendo su referente si existe.
        const userWithDetails = await User.findById(user._id)
            .populate('activeTools.tool')
            .populate('referredBy', 'username fullName');

        const settings = await Setting.findOne({ singleton: 'global_settings' }) || await Setting.create({ singleton: 'global_settings' });
        
        const userObject = userWithDetails.toObject();
        userObject.photoUrl = await getTemporaryPhotoUrl(userObject.photoFileId) || PLACEHOLDER_AVATAR_URL;
        
        const token = generateToken(user._id);

        console.log(`[Auth Sync] Sincronización exitosa para ${user.username}.`);
        res.status(200).json({ token, user: userObject, settings });

    } catch (error) {
        console.error('[Auth Sync] ERROR FATAL:'.red.bold, error);
        return res.status(500).json({ message: 'Error interno del servidor.', details: error.message });
    }
};

// --- OTRAS FUNCIONES (SIN CAMBIOS) ---

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