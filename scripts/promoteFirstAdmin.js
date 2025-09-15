// backend/scripts/promoteFirstAdmin.js (CORREGIDO)
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const colors = require('colors');
// [CORRECCIÓN] La ruta sube un nivel para encontrar la carpeta 'models'.
const User = require('../models/userModel');

// [CORRECCIÓN] La ruta sube un nivel para encontrar el archivo .env en la raíz del backend.
dotenv.config({ path: __dirname + '/../.env' });

// =========================================================================
// CONFIGURACIÓN: Reemplace este valor con su ID de Telegram
// =========================================================================
const YOUR_TELEGRAM_ID = '1601545124'; // Este es el ID que se usará.
// =========================================================================

const connectDB = async () => {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error("MONGO_URI no está definido. Asegúrate de que el archivo .env está en la raíz del backend.");
        }
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`[DB] Conectado a MongoDB: ${conn.connection.host}`.cyan.underline);
    } catch (error) {
        console.error(`Error de conexión a la base de datos: ${error.message}`.red.bold);
        process.exit(1);
    }
};

const promoteUser = async () => {
    // [CORRECCIÓN] Se elimina la condición de bloqueo incorrecta.
    // Ahora el script procederá con el ID que usted ha configurado.
    if (!YOUR_TELEGRAM_ID || YOUR_TELEGRAM_ID === 'AQUI_VA_TU_TELEGRAM_ID') {
        console.error('¡ERROR! Debes editar este script y poner tu Telegram ID en la variable YOUR_TELEGRAM_ID.'.red.bold);
        process.exit(1);
    }

    await connectDB();

    try {
        console.log(`Buscando usuario con Telegram ID: ${YOUR_TELEGRAM_ID}...`.yellow);
        const userToPromote = await User.findOneAndUpdate(
            { telegramId: YOUR_TELEGRAM_ID },
            { $set: { role: 'admin' } },
            { new: true }
        );

        if (!userToPromote) {
            console.error(`\n❌ ERROR: No se encontró ningún usuario con el Telegram ID '${YOUR_TELEGRAM_ID}'.`.red.bold);
            console.log('Asegúrate de haber iniciado el bot al menos una vez con esa cuenta.'.yellow);
            process.exit(1);
        }

        console.log('\n✅ ¡ÉXITO!'.green.bold);
        console.log(`El usuario '${userToPromote.username}' (ID: ${userToPromote.telegramId}) ha sido promovido a 'admin'.`);
        
    } catch (error) {
        console.error('Ocurrió un error durante la promoción:', error);
    } finally {
        await mongoose.connection.close();
        console.log('[DB] Conexión a MongoDB cerrada.');
    }
};

promoteUser();