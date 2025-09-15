// backend/scripts/setAdminPassword.js (CORREGIDO)
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const colors = require('colors');
const User = require('../models/userModel');
const crypto = require('crypto');

dotenv.config({ path: __dirname + '/../.env' });

// =========================================================================
// CONFIGURACIÓN: Su ID de Telegram
// =========================================================================
const ADMIN_TELEGRAM_ID = '1601545124';
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

const setPassword = async () => {
    if (!ADMIN_TELEGRAM_ID || ADMIN_TELEGRAM_ID === 'AQUI_VA_TU_ID') {
        console.error('¡ERROR! Debes editar este script y poner tu Telegram ID.'.red.bold);
        process.exit(1);
    }
    
    await connectDB();
    
    try {
        const user = await User.findOne({ telegramId: ADMIN_TELEGRAM_ID, role: 'admin' });

        if (!user) {
            console.error(`\n❌ ERROR: No se encontró un administrador con el ID '${ADMIN_TELEGRAM_ID}'.`.red.bold);
            console.log('Asegúrate de haber ejecutado el script de promoción primero.'.yellow);
            process.exit(1);
        }
        
        const temporaryPassword = crypto.randomBytes(8).toString('hex');
        
        user.password = temporaryPassword;
        user.mustResetPassword = true; 
        
        await user.save();

        console.log('\n✅ ¡ÉXITO!'.green.bold);
        console.log(`Se ha establecido una contraseña para el administrador '${user.username}'.`);
        console.log('\n--- CREDENCIALES DE ACCESO TEMPORALES ---'.yellow);
        console.log(`Usuario:      ${user.username} (o ${user.telegramId})`.cyan);
        console.log(`Contraseña:   ${temporaryPassword}`.cyan.bold);
        console.log('-------------------------------------------'.yellow);
        console.log('\nPor favor, guarde esta contraseña en un lugar seguro. Deberá cambiarla en su primer inicio de sesión.');

    } catch (error) {
        console.error('Ocurrió un error al establecer la contraseña:', error);
    } finally {
        await mongoose.connection.close();
        console.log('[DB] Conexión a MongoDB cerrada.');
    }
};

// [CORRECCIÓN] La declaración duplicada de connectDB ha sido eliminada.
setPassword();