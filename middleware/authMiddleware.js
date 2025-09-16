// backend/middleware/authMiddleware.js (FASE "INSPECTIO" v2.0 - SUPERADMIN REFORZADO)

const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const asyncHandler = require('express-async-handler');

/**
 * Middleware para proteger rutas de USUARIOS REGULARES.
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
 * Middleware para proteger rutas de ADMINISTRADORES.
 */
const protectAdmin = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_ADMIN_SECRET);

      req.user = await User.findById(decoded.id).select('-password');
      if (!req.user) {
        res.status(401);
        throw new Error('Administrador del token ya no existe.');
      }

      if (req.user.role !== 'admin') {
        res.status(403);
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
 * Verifica si el usuario ya autenticado tiene rol de 'admin'.
 */
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Acceso denegado. Se requieren permisos de administrador.' });
  }
};

/**
 * Verifica si el usuario autenticado es el Super Admin.
 */
const isSuperAdmin = (req, res, next) => {
  const superAdminId = process.env.SUPER_ADMIN_TELEGRAM_ID?.toString();
  if (req.user && req.user.telegramId?.toString() === superAdminId) {
    return next();
  }
  res.status(403).json({ message: 'Acceso denegado. Solo el Super Admin puede realizar esta acción.' });
};

/**
 * Verifica si el usuario es admin pero NO superadmin.
 */
const isAdminButNotSuper = (req, res, next) => {
  const superAdminId = process.env.SUPER_ADMIN_TELEGRAM_ID?.toString();
  if (
    req.user &&
    req.user.role === 'admin' &&
    req.user.telegramId?.toString() !== superAdminId
  ) {
    return next();
  }
  res.status(403).json({ message: 'Acceso denegado. Solo admins normales pueden realizar esta acción.' });
};

module.exports = {
  protect,
  isAdmin,
  protectAdmin,
  isSuperAdmin,
  isAdminButNotSuper,
};
