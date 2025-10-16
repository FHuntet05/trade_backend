// backend/middleware/dbErrorMiddleware.js
const handleMongoError = (err) => {
  if (err.name === 'MongoNetworkError') {
    return {
      message: 'Error de conexión con la base de datos',
      status: 503
    };
  }
  
  if (err.name === 'ValidationError') {
    return {
      message: 'Error de validación en los datos',
      status: 400,
      details: Object.values(err.errors).map(e => e.message)
    };
  }

  if (err.name === 'MongoServerError' && err.code === 11000) {
    return {
      message: 'Entrada duplicada detectada',
      status: 409
    };
  }

  // Error desconocido de MongoDB
  return {
    message: 'Error interno de base de datos',
    status: 500
  };
};

module.exports = handleMongoError;