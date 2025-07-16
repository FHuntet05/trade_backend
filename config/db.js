// backend/config/db.js

const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Añadimos un timeout para evitar que se quede colgado indefinidamente
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000 // Falla después de 5 segundos si no puede conectar
    });
    
    console.log(`[SERVIDOR] ✅ MongoDB conectado: ${conn.connection.host}`);
  } catch (error) {
    console.error(`[SERVIDOR] ‼️ ERROR DE CONEXIÓN A MONGODB: ${error.message}`);
    // Salimos del proceso con un código de error. Esto es crucial.
    process.exit(1); 
  }
};

// Listener para errores después de la conexión inicial
mongoose.connection.on('error', err => {
  console.error(`[SERVIDOR] ‼️ MongoDB perdió la conexión: ${err}`);
});

module.exports = connectDB;