// backend/middleware/authMiddleware.js (COMPLETO Y REFORZADO)

const jwt = require('jsonwebtoken');
const User = require('../models/userModel');

/**
 * @desc Middleware para proteger rutas. Verifica el token JWT y adjunta el usuario a `req`.
 */
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Obtener el token del header: "Bearer TOKEN_STRING"
      token = req.headers.authorization.split(' ')[1];

      // Verificar la firma del token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Obtener el usuario del token y adjuntarlo al objeto `req`
      // Nos aseguramos de excluir la contraseña del objeto de usuario
      req.user = await User.findById(decoded.id || decoded.user.id).select('-password'); 

      if (!req.user) {
          return res.status(401).json({ message: 'Autorización fallida, usuario del token no encontrado.' });
      }

      next(); // El token es válido y el usuario existe, proceder a la siguiente función.
    } catch (error) {
      console.error('Error de autenticación en middleware:', error.name);
      res.status(401).json({ message: 'Autorización fallida, el token no es válido o ha expirado.' });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'No se encontró token, autorización denegada.' });
  }
};

/**
 * @desc Middleware de autorización. Verifica si el usuario autenticado (por 'protect') es administrador.
 */
const isAdmin = (req, res, next) => {
    // Este middleware asume que 'protect' ya se ha ejecutado y ha adjuntado 'req.user'.
    if (req.user && req.user.role === 'admin') {
        next(); // El usuario es un administrador, permitir el acceso.
    } else {
        // Si no es un admin, enviar un error 403 Forbidden.
        res.status(403).json({ message: 'Acceso denegado. Se requieren permisos de administrador.' });
    }
};

// Exportamos ambas funciones para que puedan ser utilizadas en las rutas.
module.exports = {
  protect,
  isAdmin,
};