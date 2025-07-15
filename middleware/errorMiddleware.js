// backend/middleware/errorMiddleware.js (NUEVO ARCHIVO)

// Middleware para rutas no encontradas (404)
const notFound = (req, res, next) => {
  const error = new Error(`Ruta no encontrada - ${req.originalUrl}`);
  res.status(404);
  next(error); // Pasa el error al siguiente middleware (errorHandler)
};

// Middleware para manejar todos los demás errores
const errorHandler = (err, req, res, next) => {
  // A veces un error llega con un status 200 OK, lo cual no tiene sentido.
  // Si es así, lo cambiamos a un 500 (Error Interno del Servidor).
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message;

  // Caso especial para errores de Mongoose (ID no válido)
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 404;
    message = 'Recurso no encontrado (ID inválido)';
  }

  // Logueamos el error en el servidor para depuración, pero solo si no estamos en producción
  // para no llenar los logs con stack traces largos.
  console.error(`[ERROR HANDLER] ${err.message}`.red);
  if (process.env.NODE_ENV !== 'production') {
      console.error(err.stack.gray);
  }

  // Enviamos una respuesta JSON limpia al frontend
  res.status(statusCode).json({
    message: message,
    // En desarrollo, también podemos enviar el stack trace para facilitar la depuración
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
};

module.exports = { notFound, errorHandler };