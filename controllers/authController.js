// backend/controllers/authController.js (CÓDIGO FINAL DE PRODUCCIÓN)
const User = require('../models/userModel');
const Setting = require('../models/settingsModel');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const mongoose = require('mongoose');
const { getTemporaryPhotoUrl } = require('./userController');

const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const PLACEHOLDER_AVATAR_URL = `${process.env.FRONTEND_URL}/assets/images/user-avatar-placeholder.png`;

const getPhotoFileId = async (userId) => {
    try {
        const response = await axios.get(`${TELEGRAM_API_URL}/getUserProfilePhotos`, { params: { user_id: userId, limit: 1 }, timeout: 5000 });
        if (response.data.ok && response.data.result.photos.length > 0) {
            return response.data.result.photos[0][response.data.result.photos[0].length - 1].file_id;
        }
        return null;
    } catch (error) {
        console.error(`Error obteniendo foto para ${userId}:`, error.message);
        return null;
    }
};

const generateToken = (id, role, username) => jwt.sign({ id, role, username }, process.env.JWT_SECRET, { expiresIn: '7d' });

const syncUser = async (req, res) => {
    console.log(`[Sync] Petición recibida para /api/auth/sync. Body:`, req.body.user?.id);
    const { user: tgUser, refCode } = req.body;

    if (!tgUser || !tgUser.id) {
        return res.status(400).json({ message: 'Datos de usuario de Telegram requeridos.' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const telegramId = tgUser.id.toString();
        let user = await User.findOne({ telegramId }).session(session);

        if (!user) {
            console.log(`[Sync] Creando nuevo usuario para ${telegramId}`);
            const fullName = `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim();
            const photoFileId = await getPhotoFileId(telegramId);
            const newUser_data = {
                telegramId,
                username: tgUser.username || `user_${telegramId}`,
                fullName: fullName || tgUser.username,
                language: tgUser.language_code || 'es',
                photoFileId
            };
            
            if (refCode && refCode.trim() !== '' && refCode !== 'null') {
                const referrer = await User.findOne({ telegramId: refCode }).session(session);
                if (referrer) {
                    newUser_data.referredBy = referrer._id;
                    const newUserDoc = new User(newUser_data);
                    user = (await newUserDoc.save({ session }))[0] || newUserDoc;
                    referrer.referrals.push({ level: 1, user: user._id });
                    await referrer.save({ session });
                } else {
                    user = (await new User(newUser_data).save({ session }))[0] || new User(newUser_data);
                }
            } else {
                user = (await new User(newUser_data).save({ session }))[0] || new User(newUser_data);
            }
        } else {
             console.log(`[Sync] Usuario encontrado ${user.username}. Actualizando...`);
            user.username = tgUser.username || user.username;
            user.fullName = `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim() || user.fullName;
            if (!user.photoFileId) user.photoFileId = await getPhotoFileId(telegramId);
            await user.save({ session });
        }

        const [fullUser, settings] = await Promise.all([
            User.findById(user._id).populate('activeTools.tool').session(session),
            Setting.findOneAndUpdate({ singleton: 'global_settings' }, {}, { upsert: true, new: true }).session(session)
        ]);
        
        const token = generateToken(fullUser._id, fullUser.role, fullUser.username);
        const photoUrl = await getTemporaryPhotoUrl(fullUser.photoFileId) || PLACEHOLDER_AVATAR_URL;
        
        const userObject = fullUser.toObject();
        userObject.photoUrl = photoUrl;
        
        if (userObject.referredBy) {
            const referrerData = await User.findById(userObject.referredBy).select('telegramId').lean();
            if (referrerData) userObject.referrerId = referrerData.telegramId;
        }

        await session.commitTransaction();
        console.log(`[Sync] Éxito. Enviando datos para ${user.username}.`);
        res.status(200).json({ token, user: userObject, settings: settings || {} });

    } catch (error) {
        await session.abortTransaction();
        console.error('[Sync] Error fatal, transacción abortada:', error);
        res.status(500).json({ message: 'Error interno del servidor.', details: error.message });
    } finally {
        session.endSession();
    }
};

const getUserProfile = async (req, res) => { /* Tu código original y funcional */ };
const loginAdmin = async (req, res) => { /* Tu código original y funcional */ };

module.exports = { syncUser, getUserProfile, loginAdmin };