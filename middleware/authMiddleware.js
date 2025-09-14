// backend/middleware/authMiddleware.js (FASE "INSPECTIO" v1.0 - CORREGIDO CON PROTECCIÓN DE ADMIN)

const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const asyncHandler = require('express-async-handler');

/**
 * Middleware para proteger rutas de USUARIOS REGULARES.
 * Verifica un token firmado con JWT_SECRET.
 */
const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      req.user = await User.findById(decoded.id).select('-password'); 

      if (!req.user) {
          res.status(401);
          throw new Error('Usuario del token ya no existe.');
      }
      
      next();

    } catch (error) {
      console.error('ERROR DE AUTENTICACIÓN (User):', error.message);
      res.status(401);
      throw new Error('No autorizado, token de usuario fallido.');
    }
  }

  if (!token) {
    res.status(401);
    throw new Error('No autorizado, no hay token de usuario.');
  }
});

/**
 * [NUEVO] Middleware para proteger rutas de ADMINISTRADORES.
 * Verifica un token firmado con el secreto de administrador (JWT_ADMIN_SECRET).
 */
const protectAdmin = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      
      // [INSPECTIO - CORRECCIÓN] Se verifica el token con el secreto de administrador.
      const decoded = jwt.verify(token, process.env.JWT_ADMIN_SECRET);

      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
          res.status(401);
          throw new Error('Administrador del token ya no existe.');
      }

      // [INSPECTIO - CORRECCIÓN] Doble verificación: nos aseguramos de que el usuario del token sea un admin.
      if (req.user.role !== 'admin') {
          res.status(403); // 403 Forbidden es más apropiado que 401 Unauthorized
          throw new Error('Acceso denegado. El usuario no es un administrador.');
      }
      
      next();

    } catch (error) {
      console.error('ERROR DE AUTENTICACIÓN (Admin):', error.message);
      res.status(401);
      throw new Error('No autorizado, token de administrador fallido.');
    }
  }

  if (!token) {
    res.status(401);
    throw new Error('No autorizado, no hay token de administrador.');
  }
});

/**
 * Middleware para verificar si un usuario ya autenticado tiene rol de 'admin'.
 * Se usa DESPUÉS de 'protect' o 'protectAdmin'.
 * La versión anterior era correcta, no requiere cambios, pero se mantiene por completitud.
 */
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ message: 'Acceso denegado. Se requieren permisos de administrador.' });
    }
};

module.exports = {
  protect,
  isAdmin,
  protectAdmin // Exportamos el nuevo middleware
};