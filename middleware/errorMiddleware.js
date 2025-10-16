// backend/middleware/errorMiddleware.js
const handleMongoError = require('./dbErrorMiddleware');

// Middleware para rutas no encontradas (404)
const notFound = (req, res, next) => {
  const error = new Error(`Ruta no encontrada - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

// Middleware para manejar todos los demás errores
const errorHandler = (err, req, res, next) => {
  // Log detallado del error
  console.error('[ERROR HANDLER] Detalles completos del error:'.red);
  console.error('URL:', req.originalUrl);
  console.error('Método:', req.method);
  console.error('Error nombre:', err.name);
  console.error('Error mensaje:', err.message);
  console.error('Error código:', err.code);
  
  // Estado por defecto
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message;
  let details = null;

  // Manejar diferentes tipos de errores
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 404;
    message = 'Recurso no encontrado (ID inválido)';
  } 
  else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Error de validación';
    details = Object.values(err.errors).map(e => e.message);
  }
  else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Token inválido';
  }
  else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expirado';
  }
  else if (err.name?.startsWith('Mongo')) {
    const mongoError = handleMongoError(err);
    statusCode = mongoError.status;
    message = mongoError.message;
    details = mongoError.details;
  }

  // Log del error procesado
  console.error(`[ERROR HANDLER] Error procesado - Status: ${statusCode}, Mensaje: ${message}`.yellow);
  
  // En desarrollo, mostrar más detalles
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack.gray);
  }

  // Enviar respuesta
  res.status(statusCode).json({
    success: false,
    message,
    details,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    // Incluir el ID del error para seguimiento
    errorId: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  });
};

module.exports = { notFound, errorHandler };