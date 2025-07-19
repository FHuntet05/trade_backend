// backend/controllers/authController.js (VERSIÓN COMPLETA CON LOGGING EXHAUSTIVO)
const User = require('../models/userModel');
const Setting = require('../models/settingsModel');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const mongoose = require('mongoose');
const { getTemporaryPhotoUrl } = require('./userController');

const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const PLACEHOLDER_AVATAR_URL = `${process.env.FRONTEND_URL}/assets/images/user-avatar-placeholder.png`;

// --- Función de utilidad para obtener la foto (con logging) ---
const getPhotoFileId = async (userId) => {
    console.log(`[SYNC-TRACE] ---> [getPhotoFileId] Iniciando para userId: ${userId}`);
    try {
        const response = await axios.get(`${TELEGRAM_API_URL}/getUserProfilePhotos`, {
            params: { user_id: userId, limit: 1 },
            timeout: 5000
        });
        if (response.data.ok && response.data.result.photos.length > 0) {
            const photoArray = response.data.result.photos[0];
            const fileId = photoArray[photoArray.length - 1].file_id;
            console.log(`[SYNC-TRACE] ---> [getPhotoFileId] Éxito. file_id encontrado: ${fileId}`);
            return fileId;
        }
        console.log(`[SYNC-TRACE] ---> [getPhotoFileId] Advertencia: No se encontraron fotos para el usuario.`);
        return null;
    } catch (error) {
        console.error(`[SYNC-TRACE] ---> [getPhotoFileId] ERROR: No se pudo obtener el file_id para ${userId}:`, error.message);
        return null;
    }
};

const generateToken = (id, role, username) => {
    const payload = { id, role, username };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
    console.log(`[SYNC-TRACE] ----> Token JWT generado para el usuario ${username}`);
    return token;
};

// --- CONTROLADOR DE SINCRONIZACIÓN CON LOGGING EXHAUSTIVO ---
const syncUser = async (req, res) => {
    console.log(`\n\n[SYNC-TRACE] =====================================`);
    console.log(`[SYNC-TRACE] 1. /api/auth/sync INVOCADO. Timestamp: ${new Date().toISOString()}`);
    const { user: tgUser, refCode } = req.body;
    console.log(`[SYNC-TRACE]    > Datos recibidos: tgUser.id=${tgUser?.id}, refCode=${refCode}`);

    if (!tgUser || !tgUser.id) {
        console.error("[SYNC-TRACE] ERROR FATAL: tgUser o tgUser.id no están en el body. Terminando.");
        return res.status(400).json({ message: 'Datos de usuario de Telegram son requeridos.' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    console.log("[SYNC-TRACE] 2. Transacción de base de datos INICIADA.");

    try {
        const telegramId = tgUser.id.toString();
        console.log(`[SYNC-TRACE] 3. Buscando usuario existente con telegramId: ${telegramId}`);
        let user = await User.findOne({ telegramId }).session(session);

        if (!user) {
            console.log(`[SYNC-TRACE] 4a. Usuario NO encontrado. Iniciando flujo de CREACIÓN.`);
            const firstName = tgUser.first_name || '';
            const lastName = tgUser.last_name || '';
            const username = tgUser.username || `user_${telegramId}`;
            const fullName = `${firstName} ${lastName}`.trim() || username;
            
            console.log(`[SYNC-TRACE]    > Obteniendo foto de perfil...`);
            const photoFileId = await getPhotoFileId(telegramId);

            const newUser_data = { telegramId, username, fullName, language: tgUser.language_code || 'es', photoFileId };
            console.log(`[SYNC-TRACE]    > Datos para nuevo usuario preparados:`, { username, fullName, hasPhoto: !!photoFileId });

            if (refCode && refCode !== 'null' && refCode !== 'undefined' && refCode.trim() !== '') {
                console.log(`[SYNC-TRACE]    > Buscando referente con telegramId: ${refCode}`);
                const referrer = await User.findOne({ telegramId: refCode }).session(session);
                if (referrer) {
                    console.log(`[SYNC-TRACE]    > Referente ENCONTRADO: ${referrer.username}.`);
                    newUser_data.referredBy = referrer._id;
                    const newUserDoc = new User(newUser_data);
                    user = (await newUserDoc.save({ session }))[0] || newUserDoc;
                    console.log(`[SYNC-TRACE]    > Nuevo usuario GUARDADO en DB. ID: ${user._id}`);
                    referrer.referrals.push({ level: 1, user: user._id });
                    await referrer.save({ session });
                    console.log(`[SYNC-TRACE]    > Referente ACTUALIZADO con nuevo referido.`);
                } else {
                    console.warn(`[SYNC-TRACE]    > Referente NO encontrado. Creando usuario sin referente.`);
                    const newUserDoc = new User(newUser_data);
                    user = (await newUserDoc.save({ session }))[0] || newUserDoc;
                }
            } else {
                const newUserDoc = new User(newUser_data);
                user = (await newUserDoc.save({ session }))[0] || newUserDoc;
                console.log(`[SYNC-TRACE]    > Nuevo usuario (sin referente) GUARDADO en DB. ID: ${user._id}`);
            }
        } else {
            console.log(`[SYNC-TRACE] 4b. Usuario ENCONTRADO. ID: ${user._id}. Iniciando flujo de ACTUALIZACIÓN.`);
            let needsUpdate = false;
            const newUsername = tgUser.username || user.username;
            const newFullName = `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim() || user.fullName;
            if (user.username !== newUsername) { user.username = newUsername; needsUpdate = true; }
            if (user.fullName !== newFullName) { user.fullName = newFullName; needsUpdate = true; }
            if (!user.photoFileId) {
                user.photoFileId = await getPhotoFileId(telegramId);
                if (user.photoFileId) needsUpdate = true;
            }
            if (needsUpdate) {
                await user.save({ session });
                console.log(`[SYNC-TRACE]    > Usuario actualizado en DB.`);
            } else {
                console.log(`[SYNC-TRACE]    > No se detectaron cambios necesarios.`);
            }
        }

        console.log(`[SYNC-TRACE] 5. Obteniendo datos finales (usuario completo y settings)...`);
        const [fullUser, settings] = await Promise.all([
            User.findById(user._id).populate('activeTools.tool').session(session),
            Setting.findOneAndUpdate({ singleton: 'global_settings' }, {}, { upsert: true, new: true, setDefaultsOnInsert: true }).session(session)
        ]);
        console.log(`[SYNC-TRACE] 6. Generando token JWT...`);
        const token = generateToken(fullUser._id, fullUser.role, fullUser.username);
        
        console.log(`[SYNC-TRACE] 7. Obteniendo URL temporal de la foto... (Llamando a getTemporaryPhotoUrl)`);
        const photoUrl = await getTemporaryPhotoUrl(fullUser.photoFileId) || PLACEHOLDER_AVATAR_URL;
        console.log(`[SYNC-TRACE]    > URL de foto obtenida: ${photoUrl.startsWith('http') ? 'URL Válida' : 'Placeholder'}`);
        
        const userObject = fullUser.toObject();
        userObject.photoUrl = photoUrl;

        if (userObject.referredBy) {
            console.log(`[SYNC-TRACE] 8. Obteniendo telegramId del referente para la respuesta...`);
            const referrerData = await User.findById(userObject.referredBy).select('telegramId').lean();
            if (referrerData) userObject.referrerId = referrerData.telegramId;
        }

        console.log(`[SYNC-TRACE] 9. Confirmando (commit) la transacción...`);
        await session.commitTransaction();
        console.log(`[SYNC-TRACE] 10. ¡ÉXITO! Enviando respuesta 200 al cliente.`);
        console.log(`[SYNC-TRACE] =====================================\n`);
        res.status(200).json({ token, user: userObject, settings: settings || {} });

    } catch (error) {
        console.error(`[SYNC-TRACE] X. ¡ERROR! Abortando transacción. Causa:`, error);
        await session.abortTransaction();
        console.log(`[SYNC-TRACE] =====================================\n`);
        res.status(500).json({ message: 'Error interno del servidor.', details: error.message });
    } finally {
        console.log("[SYNC-TRACE] Finalizando sesión de base de datos.");
        session.endSession();
    }
};

// --- OTRAS FUNCIONES DEL CONTROLADOR (AHORA INCLUIDAS) ---

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
            res.json({
                _id: adminUser._id,
                username: adminUser.username,
                role: adminUser.role,
                isTwoFactorEnabled: adminUser.isTwoFactorEnabled,
                token: token,
                photoUrl: photoUrl
            });
        } else {
            res.status(401).json({ message: 'Credenciales inválidas.' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error del servidor' });
    }
};

module.exports = { syncUser, getUserProfile, loginAdmin };