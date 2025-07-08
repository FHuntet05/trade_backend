// backend/controllers/authController.js (VERSIÓN COMPLETA Y DEFINITIVA PARA REFERIDOS)

const User = require('../models/userModel');
const jwt = require('jsonwebtoken');
const { validate, parse } = require('@telegram-apps/init-data-node');

const authTelegramUser = async (req, res) => {
  const { initData, startParam } = req.body;
  if (!initData) return res.status(400).json({ message: 'initData es requerido.' });
  try {
    await validate(initData, process.env.TELEGRAM_BOT_TOKEN, { expiresIn: 3600 });
    const parsedData = parse(initData);
    const userData = parsedData.user;
    if (!userData) return res.status(401).json({ message: 'Información de usuario no encontrada en initData.' });
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
      let referrer = null;
      if (startParam) {
        referrer = await User.findOne({ $or: [{ referralCode: startParam }, { telegramId: startParam }] });
      }
      if (!referrer && startParam) console.log(`ADVERTENCIA: Se recibió un startParam "${startParam}" pero no se encontró ningún referente coincidente.`);
      const newUserFields = { telegramId, username, language, photoUrl, referredBy: referrer ? referrer._id : null };
      user = new User(newUserFields);
      await user.save();
      if (referrer) {
        console.log(`Nuevo usuario ${user.username} (ID: ${user.telegramId}) referido por: ${referrer.username} (ID: ${referrer.telegramId})`);
        referrer.referrals.push({ level: 1, user: user._id });
        await referrer.save();
        console.log(`Referente ${referrer.username} actualizado correctamente.`);
      }
    }
    const userForResponse = await User.findById(user._id).populate('activeTools.tool');
    const token = jwt.sign({ user: { id: userForResponse.id } }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: userForResponse.toObject() });
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