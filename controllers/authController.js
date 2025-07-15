// backend/controllers/authController.js (CORRECCIÓN FINAL Y ROBUSTA)
const User = require('../models/userModel');
const PendingReferral = require('../models/pendingReferralModel');
const Setting = require('../models/settingsModel'); 
const jwt = require('jsonwebtoken');
const { validate, parse } = require('@telegram-apps/init-data-node');
const speakeasy = require('speakeasy');

// ... (generateToken no cambia)
const generateToken = (id, role, username) => {
  const payload = { id, role, username };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
};

const authTelegramUser = async (req, res) => {
  const { initData, startParam } = req.body;
  if (!initData) {
    return res.status(400).json({ message: 'initData es requerido.' });
  }
  try {
    // ... (la lógica de validación y creación de usuario no cambia)
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
      // ... (lógica de creación de referido no cambia)
      let referrer = null;
      let referrerTelegramId = startParam;
      const pendingReferral = await PendingReferral.findOne({ newUserId: telegramId });
      if (pendingReferral) {
        referrerTelegramId = pendingReferral.referrerId;
      }
      if (referrerTelegramId) {
        referrer = await User.findOne({ telegramId: referrerTelegramId });
      }
      user = new User({
        telegramId,
        username,
        language: userData.languageCode || 'es',
        photoUrl: userData.photoUrl || null,
        referredBy: referrer ? referrer._id : null,
      });
      await user.save();
      if (referrer) {
        referrer.referrals.push({ level: 1, user: user._id });
        await referrer.save();
        if (pendingReferral) {
          await PendingReferral.deleteOne({ _id: pendingReferral._id });
        }
      }
    }
    
    // --- CORRECCIÓN CLAVE ---
    // Usamos findOneAndUpdate con upsert:true. Esto GARANTIZA que siempre
    // obtendremos un documento de settings, creándolo con los valores por defecto
    // si no existe.
    const [userWithTools, settings] = await Promise.all([
      User.findById(user._id).populate('activeTools.tool'),
      Setting.findOneAndUpdate(
          { singleton: 'global_settings' }, 
          { $setOnInsert: { singleton: 'global_settings' } }, 
          { upsert: true, new: true, setDefaultsOnInsert: true }
      )
    ]);

    const userObject = userWithTools.toObject();
    if (userObject.referredBy) {
        const referrerData = await User.findById(userObject.referredBy).select('telegramId');
        if (referrerData) userObject.referrerId = referrerData.telegramId;
    }
    
    const token = generateToken(userObject._id, userObject.role, userObject.username);
    res.json({ token, user: userObject, settings });

  } catch (error) {
    res.status(401).json({ message: `Autenticación fallida: ${error.message}` });
  }
};

// ... (el resto del archivo, incluyendo getUserProfile y loginAdmin, se beneficia del mismo patrón, así que lo aplicamos también)
const getUserProfile = async (req, res) => {
  try {
    const [user, settings] = await Promise.all([
        User.findById(req.user._id).populate('activeTools.tool'),
        Setting.findOneAndUpdate(
            { singleton: 'global_settings' },
            { $setOnInsert: { singleton: 'global_settings' } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        )
    ]);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    const userObject = user.toObject();
    if (userObject.referredBy) {
        const referrerData = await User.findById(userObject.referredBy).select('telegramId');
        if (referrerData) userObject.referrerId = referrerData.telegramId;
    }
    res.json({ user: userObject, settings });
  } catch (error) {
    res.status(500).json({ message: 'Error del servidor' });
  }
};
// ... (loginAdmin no necesita settings, así que no se toca)

module.exports = { authTelegramUser, getUserProfile, loginAdmin };