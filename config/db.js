// backend/config/db.js (VERSIÓN v18.6 - BLINDADO CONTRA FALLOS SILENCIOSOS)
const mongoose = require('mongoose');
const colors = require('colors');

const connectDB = async () => {
  try {
    // Intenta conectar a la base de datos usando la variable de entorno
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    // Si la conexión es exitosa, lo notifica en la consola con texto verde.
    console.log(`[DB] ✅ MongoDB Conectado: ${conn.connection.host}`.cyan.underline.bold);
  } catch (error) {
    // Si la conexión falla, lo notifica con un error claro en rojo.
    console.error(`[DB] ❌ ERROR DE CONEXIÓN: ${error.message}`.red.bold);
    // CRÍTICO: Detiene todo el proceso del servidor con un código de error.
    // Esto previene que el servidor corra en un estado "zombi" sin conexión a la BD.
    process.exit(1);
  }
};

module.exports = connectDB;