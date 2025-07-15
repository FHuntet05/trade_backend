// backend/controllers/twoFactorAuthController.js (COMPLETO)
const User = require('../models/userModel');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');

/**
 * @desc    Verifica el token 2FA y, si es correcto, completa el login del admin
 * @route   POST /api/auth/2fa/verify-login
 * @access  Public
 */
const verifyLoginToken = async (req, res) => {
  const { userId, token } = req.body;

  if (!userId || !token) {
    return res.status(400).json({ message: 'Se requiere el ID de usuario y el token.' });
  }

  try {
    const user = await User.findById(userId).select('+twoFactorSecret');
    if (!user || !user.isTwoFactorEnabled || !user.twoFactorSecret) {
      return res.status(401).json({ message: '2FA no está habilitado o no es requerido para este usuario.' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 1, // Permite una pequeña deriva de tiempo (1 * 30 segundos)
    });

    if (verified) {
      // Si el token 2FA es correcto, generamos el token de sesión final
      const sessionTokenPayload = { id: user._id, role: user.role, username: user.username };
      const sessionToken = jwt.sign(sessionTokenPayload, process.env.JWT_SECRET, { expiresIn: '8h' });

      res.json({
        _id: user._id,
        username: user.username,
        role: user.role,
        isTwoFactorEnabled: user.isTwoFactorEnabled,
        token: sessionToken,
      });
    } else {
      res.status(401).json({ message: 'Token de autenticación de dos factores inválido.' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error del servidor al verificar el token 2FA.' });
  }
};

module.exports = { verifyLoginToken };