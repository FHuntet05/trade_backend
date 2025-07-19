// backend/controllers/authController.js (VERSIÓN TRANSACCIONAL Y BLINDADA)
const User = require('../models/userModel');
const Setting = require('../models/settingsModel');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const mongoose = require('mongoose'); // Importamos mongoose para las transacciones
const { getTemporaryPhotoUrl } = require('./userController');

const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const PLACEHOLDER_AVATAR_URL = `${process.env.FRONTEND_URL}/assets/images/user-avatar-placeholder.png`;

// --- Función de utilidad para obtener la foto (se mantiene, es un requisito) ---
const getPhotoFileId = async (userId) => {
    try {
        const response = await axios.get(`${TELEGRAM_API_URL}/getUserProfilePhotos`, {
            params: { user_id: userId, limit: 1 },
            timeout: 5000 // Un timeout razonable
        });
        if (response.data.ok && response.data.result.photos.length > 0) {
            const photoArray = response.data.result.photos[0];
            // Devolvemos el file_id de la foto de mayor resolución
            return photoArray[photoArray.length - 1].file_id;
        }
        return null;
    } catch (error) {
        // Si falla, no debe detener el proceso. Simplemente no habrá foto.
        console.error(`[Photo Fetch] No se pudo obtener el file_id para ${userId}:`, error.message);
        return null;
    }
};

const generateToken = (id, role, username) => {
    const payload = { id, role, username };
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// --- CONTROLADOR DE SINCRONIZACIÓN RECONSTRUIDO CON TRANSACCIONES ---
const syncUser = async (req, res) => {
    console.log('[Controller] -> /api/auth/sync: Petición RECIBIDA.');
    const { user: tgUser, refCode } = req.body;

    // Validación de entrada más robusta
    if (!tgUser || !tgUser.id) {
        return res.status(400).json({ message: 'Datos de usuario de Telegram son requeridos.' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const telegramId = tgUser.id.toString();
        let user = await User.findOne({ telegramId }).session(session);

        if (!user) {
            // === CREACIÓN DE NUEVO USUARIO DENTRO DE UNA TRANSACCIÓN ===
            console.log(`[Sync Tx] Usuario con ID ${telegramId} no encontrado. Creando...`);
            
            // Blindaje de datos: Aseguramos que no haya errores por campos nulos
            const firstName = tgUser.first_name || '';
            const lastName = tgUser.last_name || '';
            const username = tgUser.username || `user_${telegramId}`;
            const fullName = `${firstName} ${lastName}`.trim() || username;
            
            // La obtención de la foto ocurre aquí, como se requiere.
            const photoFileId = await getPhotoFileId(telegramId);

            const newUser_data = {
                telegramId,
                username,
                fullName,
                language: tgUser.language_code || 'es',
                photoFileId
            };
            
            // Verificamos el referente y lo vinculamos de forma atómica
            if (refCode && refCode !== 'null' && refCode !== 'undefined' && refCode.trim() !== '') {
                const referrer = await User.findOne({ telegramId: refCode }).session(session);
                if (referrer) {
                    console.log(`[Sync Tx] Referente encontrado: ${referrer.username}. Vinculando...`);
                    newUser_data.referredBy = referrer._id;
                    
                    const newUserDoc = new User(newUser_data);
                    user = (await newUserDoc.save({ session }))[0] || newUserDoc; // .save() con session devuelve un array
                    
                    referrer.referrals.push({ level: 1, user: user._id });
                    await referrer.save({ session });
                    console.log(`[Sync Tx] ✅ Usuario y referente actualizados atómicamente.`);

                } else {
                    console.warn(`[Sync Tx] Referente con telegramId '${refCode}' no encontrado. Creando usuario sin referente.`);
                    const newUserDoc = new User(newUser_data);
                    user = (await newUserDoc.save({ session }))[0] || newUserDoc;
                }
            } else {
                // Caso sin referente
                const newUserDoc = new User(newUser_data);
                user = (await newUserDoc.save({ session }))[0] || newUserDoc;
            }
        } else {
            // === ACTUALIZACIÓN DE USUARIO EXISTENTE ===
            console.log(`[Sync] Usuario con ID ${telegramId} encontrado. Actualizando...`);
            let needsUpdate = false;
            // Blindaje de datos
            const newUsername = tgUser.username || user.username;
            const newFullName = `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim() || user.fullName;

            if (user.username !== newUsername) { user.username = newUsername; needsUpdate = true; }
            if (user.fullName !== newFullName) { user.fullName = newFullName; needsUpdate = true; }
            
            // Solo buscamos foto nueva si no tiene una, para optimizar
            if (!user.photoFileId) {
                user.photoFileId = await getPhotoFileId(telegramId);
                if (user.photoFileId) needsUpdate = true;
            }
            
            if (needsUpdate) {
                await user.save({ session });
            }
        }

        // --- OBTENCIÓN DE DATOS FINALES Y RESPUESTA ---
        // Usamos .populate() fuera de la transacción si es posible para reducir su duración,
        // pero para consistencia lo mantenemos dentro.
        const [fullUser, settings] = await Promise.all([
            User.findById(user._id).populate('activeTools.tool').session(session),
            Setting.findOneAndUpdate({ singleton: 'global_settings' }, {}, { upsert: true, new: true, setDefaultsOnInsert: true }).session(session)
        ]);
        
        const token = generateToken(fullUser._id, fullUser.role, fullUser.username);
        
        // Obtenemos la URL temporal de la foto, como se requiere
        const photoUrl = await getTemporaryPhotoUrl(fullUser.photoFileId) || PLACEHOLDER_AVATAR_URL;
        
        const userObject = fullUser.toObject();
        userObject.photoUrl = photoUrl;

        if (userObject.referredBy) {
            // Esta consulta no necesita estar en la transacción, es solo de lectura.
            const referrerData = await User.findById(userObject.referredBy).select('telegramId').lean();
            if (referrerData) userObject.referrerId = referrerData.telegramId;
        }

        // Si todo ha ido bien, confirmamos la transacción
        await session.commitTransaction();

        console.log(`[Sync] ✅ Transacción completada. Enviando respuesta 200 al cliente.`);
        res.status(200).json({ token, user: userObject, settings: settings || {} });

    } catch (error) {
        // Si algo falla, abortamos la transacción para que no se guarde nada
        await session.abortTransaction();
        console.error('[Controller] -> /api/auth/sync: CATCH - Error fatal. Transacción abortada.', error);
        res.status(500).json({ message: 'Error interno del servidor.', details: error.message });
    } finally {
        // Siempre terminamos la sesión
        session.endSession();
    }
};


// Las otras funciones se mantienen sin cambios, las incluyo por completitud.
const getUserProfile = async (req, res) => {
    try {
        const [user, settings] = await Promise.all([
            User.findById(req.user.id).populate('activeTools.tool'),
            Setting.findOne({ singleton: 'global_settings' })
        ]);
        if (!user) { return res.status(404).json({ message: 'Usuario no encontrado' }); }
        
        const userObject = user.toObject();
        userObject.photoUrl = await getTemporaryPhotoUrl(userObject.photoFileId) || PLACEHOLDER_AVATAR_URL;

        if (userObject.referredBy) {
            const referrerData = await User.findById(userObject.referredBy).select('telegramId').lean();
            if (referrerData) userObject.referrerId = referrerData.telegramId;
        }
        res.json({ user: userObject, settings: settings || {} });
    } catch (error) {
        res.status(500).json({ message: 'Error del servidor' });
    }
};

const loginAdmin = async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Por favor, ingrese usuario y contraseña.' });
    }
    try {
        const adminUser = await User.findOne({ $or: [{ username: username }, { telegramId: username }] }).select('+password');
        if (adminUser && adminUser.role === 'admin' && (await adminUser.matchPassword(password))) {
            const token = generateToken(adminUser._id, adminUser.role, adminUser.username);
            const photoUrl = await getTemporaryPhotoUrl(adminUser.photoFileId) || PLACEHOLDER_AVATAR_URL;
            res.json({ _id: adminUser._id, username: adminUser.username, role: adminUser.role, isTwoFactorEnabled: adminUser.isTwoFactorEnabled, token: token, photoUrl: photoUrl });
        } else {
            res.status(401).json({ message: 'Credenciales inválidas.' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error del servidor' });
    }
};


module.exports = { syncUser, getUserProfile, loginAdmin };