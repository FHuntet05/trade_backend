// backend/controllers/authController.js (VERSIÓN FINAL CON ACTUALIZACIÓN DE PERFIL EN LOGIN)

const User = require('../models/userModel');
const jwt = require('jsonwebtoken');
const { validate, parse } = require('@telegram-apps/init-data-node');

const authTelegramUser = async (req, res) => {
  const { initData } = req.body;

  if (!initData) {
    return res.status(400).json({ message: 'initData es requerido.' });
  }

  try {
    await validate(initData, process.env.TELEGRAM_BOT_TOKEN, { expiresIn: 3600 });

    const parsedData = parse(initData);
    const userData = parsedData.user;
    const startParam = parsedData.startParam;

    if (!userData) {
      return res.status(401).json({ message: 'Información de usuario no encontrada en initData.' });
    }

    const telegramId = userData.id.toString();
    const username = userData.username || `user_${telegramId}`;
    const language = userData.languageCode || 'es';
    const photoUrl = userData.photoUrl || null;

    let user = await User.findOne({ telegramId });

    if (user) {
      // --- INICIO DE LA CORRECCIÓN: LÓGICA PARA USUARIOS EXISTENTES ---
      // El usuario ya existe, así que actualizamos su información si ha cambiado.
      // Esto es crucial para que los usuarios antiguos obtengan su foto de perfil.
      let needsUpdate = false;
      if (user.username !== username) {
        user.username = username;
        needsUpdate = true;
      }
      if (user.photoUrl !== photoUrl) {
        user.photoUrl = photoUrl;
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        console.log(`Actualizando perfil para el usuario: ${username}`);
        await user.save();
      }
      // --- FIN DE LA CORRECCIÓN ---

    } else {
      // El usuario es nuevo. Procedemos con la lógica de creación y referidos.
      let referrer = null;
      if (startParam) {
        referrer = await User.findOne({ telegramId: startParam });
      }

      const newUserFields = {
        telegramId,
        username,
        language,
        photoUrl,
        referredBy: referrer ? referrer._id : null,
      };

      user = new User(newUserFields);
      await user.save();

      if (referrer) {
        console.log(`Nuevo usuario referido por: ${referrer.username}`);
        referrer.referrals.push({ level: 1, user: user._id });
        await referrer.save();
      }
    }
    
    // El resto del flujo es el mismo.
    const userForResponse = await User.findById(user._id).populate('activeTools.tool');
    const token = jwt.sign({ user: { id: userForResponse.id } }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: userForResponse.toObject(),
    });

  } catch (error) {
    console.error('Error en la autenticación o validación de initData:', error.message);
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