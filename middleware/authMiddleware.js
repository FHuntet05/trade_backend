// backend/middleware/authMiddleware.js (VERSIÓN v16.0 - ESTABLE)

const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const asyncHandler = require('express-async-handler');

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // 1. Obtener el token del header
      token = req.headers.authorization.split(' ')[1];

      // 2. Verificar la firma del token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 3. Obtener el usuario del token y adjuntarlo a `req`
      const userId = decoded.id; 
      if (!userId) {
        res.status(401);
        throw new Error('Token inválido, no contiene ID de usuario.');
      }
      
      req.user = await User.findById(userId).select('-password'); 

      if (!req.user) {
          res.status(401);
          throw new Error('Usuario del token ya no existe.');
      }
      
      // Si todo va bien, pasa al siguiente middleware/controlador
      next();

    } catch (error) {
      console.error('ERROR DE AUTENTICACIÓN:', error.message);
      res.status(401);
      throw new Error('No autorizado, token fallido.');
    }
  }

  if (!token) {
    res.status(401);
    throw new Error('No autorizado, no hay token.');
  }
});

/**
 * CORRECCIÓN v16.0: Se reemplazó 'throw new Error' con 'res.json'
 * para asegurar que se envía una respuesta al cliente en caso de no ser administrador,
 * evitando así que la solicitud se quede colgada indefinidamente.
 */
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        // CORRECCIÓN: Enviar una respuesta JSON en lugar de lanzar un error.
        res.status(403).json({ message: 'Acceso denegado. Se requieren permisos de administrador.' });
    }
};

module.exports = {
  protect,
  isAdmin,
};