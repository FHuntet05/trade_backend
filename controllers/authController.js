// --- START OF FILE backend/controllers/authController.js (CORREGIDO Y MEJORADO) ---

const User = require('../models/userModel');
const PendingReferral = require('../models/pendingReferralModel');
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
    const firstName = userData.firstName || null;
    const lastName = userData.lastName || null;

    let user = await User.findOne({ telegramId });

    if (user) {
      let needsUpdate = false;
      if (user.username !== username) { user.username = username; needsUpdate = true; }
      if (user.photoUrl !== photoUrl) { user.photoUrl = photoUrl; needsUpdate = true; }
      if (user.firstName !== firstName) { user.firstName = firstName; needsUpdate = true; }
      if (user.lastName !== lastName) { user.lastName = lastName; needsUpdate = true; }
      if (needsUpdate) {
        await user.save();
      }
    } else {
      let referrer = null;
      let referrerTelegramId = startParam;

      const pendingReferral = await PendingReferral.findOne({ newUserId: telegramId });
      if (pendingReferral) {
        referrerTelegramId = pendingReferral.referrerId;
      }
      
      if (referrerTelegramId) {
        referrer = await User.findOne({ telegramId: referrerTelegramId });
      }

      const newUserFields = {
        telegramId,
        username,
        language,
        photoUrl,
        firstName,
        lastName,
        referredBy: referrer ? referrer._id : null,
      };

      user = new User(newUserFields);
      await user.save();

      if (referrer) {
        referrer.referrals.push({ level: 1, user: user._id });
        await referrer.save();
        if (pendingReferral) {
          await PendingReferral.deleteOne({ _id: pendingReferral._id });
        }
      }
    }
    
    // --- SOLUCIÓN CLAVE: CONSTRUCCIÓN DEL OBJETO DE USUARIO COMPLETO ---
    
    // 1. Populamos los datos de las herramientas activas
    const userWithTools = await User.findById(user._id).populate('activeTools.tool');
    
    // 2. Convertimos el documento de Mongoose a un objeto plano de JavaScript
    const userObject = userWithTools.toObject();

    // 3. Añadimos manualmente el ID de Telegram del referente, si existe
    // Buscamos al referente en la base de datos para obtener su telegramId
    if (userObject.referredBy) {
        const referrerData = await User.findById(userObject.referredBy).select('telegramId');
        if (referrerData) {
            userObject.referrerId = referrerData.telegramId; // <<< ESTE ES EL CAMPO QUE EL FRONTEND ESPERA
        }
    }
    
    const token = jwt.sign({ user: { id: userObject._id } }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: userObject, // <<< Enviamos el objeto de usuario completo y enriquecido
    });

  } catch (error) {
    console.error('Error en la autenticación:', error);
    res.status(401).json({ message: `Autenticación fallida: ${error.message}` });
  }
};

const getUserProfile = async (req, res) => {
  try {
    // --- SOLUCIÓN CLAVE 2: ASEGURAR QUE EL PERFIL TAMBIÉN DEVUELVA LOS DATOS ---
    const user = await User.findById(req.user.id).populate('activeTools.tool');
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    
    const userObject = user.toObject();
    
    if (userObject.referredBy) {
        const referrerData = await User.findById(userObject.referredBy).select('telegramId');
        if (referrerData) {
            userObject.referrerId = referrerData.telegramId;
        }
    }
    
    res.json(userObject);
    
  } catch (error) {
    console.error('Error al obtener el perfil:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

module.exports = { authTelegramUser, getUserProfile };

// --- END OF FILE backend/controllers/authController.js ---