// backend/controllers/authController.js (VERSIÓN FINAL CON LÓGICA DE PRE-VINCULACIÓN)

const User = require('../models/userModel');
const PendingReferral = require('../models/pendingReferralModel'); // <-- Importamos el nuevo modelo
const jwt = require('jsonwebtoken');
const { validate, parse } = require('@telegram-apps/init-data-node');

const authTelegramUser = async (req, res) => {
  const { initData, startParam } = req.body;

  if (!initData) {
    return res.status(400).json({ message: 'initData es requerido.' });
  }

  try {
    await validate(initData, process.env.TELEGRAM_BOT_TOKEN, { expiresIn: 3600 });
    const parsedData = parse(initData);
    const userData = parsedData.user;

    if (!userData) {
      return res.status(401).json({ message: 'Información de usuario no encontrada en initData.' });
    }

    const telegramId = userData.id.toString();
    const username = userData.username || `user_${telegramId}`;
    const language = userData.languageCode || 'es';
    const photoUrl = userData.photoUrl || null;

    let user = await User.findOne({ telegramId });

    if (user) {
      let needsUpdate = false;
      if (user.username !== username) { user.username = username; needsUpdate = true; }
      if (user.photoUrl !== photoUrl) { user.photoUrl = photoUrl; needsUpdate = true; }
      if (needsUpdate) {
        console.log(`Actualizando perfil para el usuario existente: ${username}`);
        await user.save();
      }
    } else {
      // --- LÓGICA DE BÚSQUEDA DE REFERENTE MEJORADA ---
      let referrer = null;
      let referrerTelegramId = startParam; // Usamos el startParam como primera opción

      // 1. Buscamos si hay una pre-vinculación guardada por el bot
      const pendingReferral = await PendingReferral.findOne({ newUserId: telegramId });
      if (pendingReferral) {
        referrerTelegramId = pendingReferral.referrerId;
        console.log(`[Auth] Pre-vinculación encontrada para ${telegramId}. ID del referente: ${referrerTelegramId}`);
      }

      // 2. Si tenemos un ID de referente (de cualquier fuente), buscamos al usuario referente
      if (referrerTelegramId) {
        console.log(`Buscando referente con ID de Telegram: ${referrerTelegramId}`);
        referrer = await User.findOne({ telegramId: referrerTelegramId });
      }

      if (!referrer && startParam) {
        console.log(`ADVERTENCIA: Se usó un startParam/pre-vinculación "${startParam}" pero no se encontró ningún referente.`);
      }

      // 3. Procedemos con la creación del usuario y la vinculación
      const newUserFields = { telegramId, username, language, photoUrl, referredBy: referrer ? referrer._id : null };
      user = new User(newUserFields);
      await user.save();

      if (referrer) {
        console.log(`Vinculando nuevo usuario ${user.username} con referente ${referrer.username}`);
        referrer.referrals.push({ level: 1, user: user._id });
        await referrer.save();
        console.log(`Referente ${referrer.username} actualizado.`);
        
        // 4. (Opcional pero recomendado) Limpiamos la pre-vinculación una vez usada
        if (pendingReferral) {
          await PendingReferral.deleteOne({ _id: pendingReferral._id });
        }
      }
    }
    
    const userForResponse = await User.findById(user._id).populate('activeTools.tool');
    const token = jwt.sign({ user: { id: userForResponse.id } }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: userForResponse.toObject(),
    });

  } catch (error) {
    console.error('Error en la autenticación:', error);
    res.status(401).json({ message: `Autenticación fallida: ${error.message}` });
  }
};

const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('activeTools.tool');
    if (user) {
        res.json(user.toObject());
    } else {
        res.status(404).json({ message: 'Usuario no encontrado' });
    }
  } catch (error) {
    console.error('Error al obtener el perfil:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

module.exports = {
  authTelegramUser,
  getUserProfile, 
};