// backend/controllers/authController.js (VERSIÓN FINAL COMPLETA Y SEGURA)

const User = require('../models/userModel');
const jwt = require('jsonwebtoken');
// 1. Usamos la librería recomendada y actualizada
const { validate } = require('@telegram-apps/init-data-node');

const authTelegramUser = async (req, res) => {
  const { initData } = req.body;

  if (!initData) {
    return res.status(400).json({ message: 'initData es requerido.' });
  }

  try {
    // 2. Validamos la initData contra nuestro BOT_TOKEN secreto.
    // La validación arrojará un error si la firma es inválida o si ha expirado.
    await validate(initData, process.env.TELEGRAM_BOT_TOKEN, { expiresIn: 3600 }); // Expira en 1 hora

    // 3. Si la validación es exitosa, podemos confiar en los datos y parsearlos.
    const params = new URLSearchParams(initData);
    const userJson = params.get('user');
    const userData = JSON.parse(userJson);

    const telegramId = userData.id.toString();
    const username = userData.username || `user_${telegramId}`;
    const language = userData.language_code || 'es';
    
    // Extraemos el código de referido del start_param si existe
    const startParam = params.get('start_param');
    let referredByUser = null;
    if (startParam) {
      referredByUser = await User.findOne({ referralCode: startParam });
    }

    // 4. Buscamos o creamos el usuario en nuestra base de datos.
    let user = await User.findOne({ telegramId });

    if (!user) {
      user = new User({
        telegramId,
        username,
        language,
        referredBy: referredByUser ? referredByUser._id : null,
      });
      await user.save();
    }
    
    // 5. Generamos nuestro propio token JWT para gestionar la sesión en nuestra API.
    const userForResponse = await User.findById(user._id).populate('activeTools.tool');
    const token = jwt.sign({ user: { id: userForResponse.id } }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: userForResponse.toObject(),
    });

  } catch (error) {
    console.error('Error en la autenticación o validación de initData:', error.message);
    res.status(401).json({ message: 'Autenticación fallida. La initData es inválida o ha expirado.' });
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