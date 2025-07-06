// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/userModel'); // Asegúrate que userModel.js esté en la carpeta /models

const authMiddleware = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Obtener el token del header: "Bearer TOKEN"
      token = req.headers.authorization.split(' ')[1];

      // Verificar el token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Obtener el usuario del token y adjuntarlo al objeto `req` para usarlo en los controladores
      req.user = await User.findById(decoded.user.id).select('-password'); 

      if (!req.user) {
          return res.status(401).json({ message: 'Usuario del token no encontrado.' });
      }

      next(); // Pasa al siguiente middleware o controlador
    } catch (error) {
      console.error('Error de autenticación en middleware:', error);
      res.status(401).json({ message: 'Token no válido o expirado.' });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'No hay token, autorización denegada.' });
  }
};

module.exports = authMiddleware;