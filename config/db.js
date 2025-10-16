// backend/config/db.js
const mongoose = require('mongoose');
const colors = require('colors');

const connectDB = async () => {
  // Validar la URI de MongoDB
  if (!process.env.MONGO_URI) {
    console.error('[DB] ❌ ERROR CRÍTICO: Variable MONGO_URI no definida'.red.bold);
    process.exit(1);
  }

  const options = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    maxPoolSize: 50,
    wtimeoutMS: 2500,
    maxIdleTimeMS: 10000,
    heartbeatFrequencyMS: 2000,
  };

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, options);
    console.log(`[DB] ✅ MongoDB Conectado: ${conn.connection.host}`.cyan.underline.bold);
    
    // Configurar event listeners para la conexión
    mongoose.connection.on('error', err => {
      console.error('[DB] ❌ Error en la conexión de MongoDB:'.red.bold, err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[DB] 🔌 Desconectado de MongoDB'.yellow);
    });

    mongoose.connection.on('reconnected', () => {
      console.log('[DB] 🔄 Reconectado a MongoDB'.green);
    });

    // Manejar señales de terminación
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        console.log('[DB] Conexión de MongoDB cerrada por terminación de app'.cyan);
        process.exit(0);
      } catch (err) {
        console.error('[DB] Error al cerrar la conexión de MongoDB:'.red, err);
        process.exit(1);
      }
    });

  } catch (error) {
    console.error(`[DB] ❌ ERROR DE CONEXIÓN: ${error.message}`.red.bold);
    
    // Verificar tipo específico de error
    if (error.name === 'MongoNetworkError') {
      console.error('[DB] Error de red al conectar con MongoDB'.red);
    } else if (error.name === 'MongoTimeoutError') {
      console.error('[DB] Timeout al intentar conectar con MongoDB'.red);
    }
    
    // En un entorno serverless, es mejor no terminar el proceso
    if (process.env.VERCEL) {
      throw error; // Propagar el error para que Vercel lo maneje
    } else {
      process.exit(1);
    }
  }
};

module.exports = connectDB;