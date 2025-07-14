// backend/controllers/adminController.js

const User = require('../models/userModel');
const jwt = require('jsonwebtoken');

// Función para generar un token JWT
const generateToken = (id, role, username) => {
  return jwt.sign({ id, role, username }, process.env.JWT_SECRET, {
    expiresIn: '8h', // Token de admin con duración de una jornada laboral
  });
};

/**
 * @desc    Autenticar a un administrador y obtener un token
 * @route   POST /api/admin/login
 * @access  Public
 */
const loginAdmin = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Por favor, ingrese usuario y contraseña.' });
  }

  try {
    // 1. Encontrar al usuario por su 'username' y seleccionar explícitamente la contraseña
    const adminUser = await User.findOne({ username }).select('+password');

    // 2. Verificar si el usuario existe, si tiene contraseña y si es un administrador
    if (adminUser && adminUser.role === 'admin' && (await adminUser.matchPassword(password))) {
      // 3. Si todo es correcto, generar un token y enviarlo
      res.json({
        _id: adminUser._id,
        username: adminUser.username,
        role: adminUser.role,
        token: generateToken(adminUser._id, adminUser.role, adminUser.username),
      });
    } else {
      // 4. Si la autenticación falla, enviar un error genérico
      res.status(401).json({ message: 'Credenciales inválidas.' });
    }
  } catch (error) {
    console.error('Error en el login del administrador:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

module.exports = {
  loginAdmin,
};