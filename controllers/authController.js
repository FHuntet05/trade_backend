// backend/controllers/authController.js (COMPLETO Y CONSOLIDADO)

const User = require('../models/userModel');
const PendingReferral = require('../models/pendingReferralModel');
const jwt = require('jsonwebtoken');
const { validate, parse } = require('@telegram-apps/init-data-node');

// Función para generar un token JWT
const generateToken = (id, role, username) => {
  // Unificamos el payload del token para ser consistente
  const payload = {
    id: id,
    role: role,
    username: username
  };
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '7d', // Duración estándar, para admins será de 8h pero se define en su login
  });
};

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
    let user = await User.findOne({ telegramId });

    if (!user) {
      // Lógica para crear nuevo usuario y manejar referidos (sin cambios)
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
        language: userData.languageCode || 'es',
        photoUrl: userData.photoUrl || null,
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
    
    const userWithTools = await User.findById(user._id).populate('activeTools.tool');
    const userObject = userWithTools.toObject();

    if (userObject.referredBy) {
        const referrerData = await User.findById(userObject.referredBy).select('telegramId');
        if (referrerData) {
            userObject.referrerId = referrerData.telegramId;
        }
    }
    
    // El token ahora incluye el rol para mayor consistencia
    const token = generateToken(userObject._id, userObject.role, userObject.username);

    res.json({
      token,
      user: userObject,
    });

  } catch (error) {
    console.error('Error en la autenticación de Telegram:', error);
    res.status(401).json({ message: `Autenticación fallida: ${error.message}` });
  }
};

const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('activeTools.tool');
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


/**
 * @desc    Autenticar a un administrador y obtener un token
 * @route   POST /api/auth/login/admin
 * @access  Public
 */
const loginAdmin = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Por favor, ingrese usuario y contraseña.' });
  }

  try {
    const adminUser = await User.findOne({ username }).select('+password');

    if (adminUser && adminUser.role === 'admin' && (await adminUser.matchPassword(password))) {
      const tokenPayload = {
        id: adminUser._id,
        role: adminUser.role,
        username: adminUser.username
      };
      
      const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
        expiresIn: '8h', // Token de admin con duración de una jornada laboral
      });
      
      res.json({
        _id: adminUser._id,
        username: adminUser.username,
        role: adminUser.role,
        token: token,
      });
    } else {
      res.status(401).json({ message: 'Credenciales inválidas.' });
    }
  } catch (error) {
    console.error('Error en el login del administrador:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};


module.exports = { authTelegramUser, getUserProfile, loginAdmin };