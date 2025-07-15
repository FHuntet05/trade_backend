// backend/index.js (PRUEBA DE AISLAMIENTO DEFINITIVA)
console.log('--- INICIANDO PRUEBA DE AISLAMIENTO ---'.bgYellow.black);

const express = require('express');
const { Telegraf } = require('telegraf');
require('dotenv').config();
require('colors');

console.log('[PASO 1] Dependencias base cargadas.');

// --- Verificación explícita y agresiva del token de Telegram ---
const botToken = process.env.TELEGRAM_BOT_TOKEN;
console.log(`[PASO 2] Verificando TELEGRAM_BOT_TOKEN...`);

if (!botToken || botToken.length < 10) { // Un token real es mucho más largo
    console.error('‼️ FATAL: TELEGRAM_BOT_TOKEN es undefined, vacío o inválido.'.red.bold);
    console.error(`--> Valor encontrado: ${botToken}`.red);
    console.error('--> ACCIÓN: Vaya al Dashboard de Render > Environment y verifique que la variable TELEGRAM_BOT_TOKEN existe y tiene el valor correcto. No confíe en el archivo .env en Render.'.yellow.bold);
    process.exit(1);
}

console.log(`[PASO 2.1] Token encontrado. Longitud: ${botToken.length}.`.green);

// --- Inicialización del bot ---
let bot;
try {
    bot = new Telegraf(botToken);
    console.log('[PASO 3] Objeto Telegraf inicializado correctamente.'.green);
} catch (e) {
    console.error('‼️ FATAL: Fallo al inicializar Telegraf. ¿El token tiene un formato inválido?'.red.bold, e);
    process.exit(1);
}

// --- Creación del secretPath (el sospechoso principal) ---
let secretPathComponent;
try {
    secretPathComponent = bot.secretPathComponent();
    console.log(`[PASO 4] bot.secretPathComponent() ejecutado. Resultado: "${secretPathComponent}"`.green);
} catch(e) {
    console.error('‼️ FATAL: Fallo al ejecutar bot.secretPathComponent().'.red.bold, e);
    process.exit(1);
}

const secretPath = `/api/telegram-webhook/${secretPathComponent}`;
console.log(`[PASO 5] La ruta final a registrar es: "${secretPath}"`.cyan.bold);
console.log('--- SI EL SCRIPT FALLA AHORA, EL ERROR ESTÁ EN LA LÍNEA SIGUIENTE ---'.bgRed.white);

try {
    const app = express();
    // Intento de registrar la ruta más simple posible que podría fallar
    const router = express.Router();
    router.get('/users/:id', (req, res) => res.send('OK')); // Ruta de prueba para verificar que path-to-regexp funciona
    
    console.log('[PASO 6] Ruta de prueba con parámetro (:id) registrada exitosamente.'.green);

    // Volvemos a habilitar la importación de rutas una a una
    console.log('--- Ahora, identificando el archivo de ruta corrupto ---'.yellow.bold);
    
    // Habilita estas líneas una por una, empezando por authRoutes.
    // El servidor se romperá cuando importes el archivo con el error.

    // const authRoutes = require('./routes/authRoutes'); console.log('✅ authRoutes cargado');
    // const toolRoutes = require('./routes/toolRoutes'); console.log('✅ toolRoutes cargado');
    // const rankingRoutes = require('./routes/rankingRoutes'); console.log('✅ rankingRoutes cargado');
    // const walletRoutes = require('./routes/walletRoutes'); console.log('✅ walletRoutes cargado');
    // const teamRoutes = require('./routes/teamRoutes'); console.log('✅ teamRoutes cargado');
    // const taskRoutes = require('./routes/taskRoutes'); console.log('✅ taskRoutes cargado');
    // const paymentRoutes = require('./routes/paymentRoutes'); console.log('✅ paymentRoutes cargado');
    const adminRoutes = require('./routes/adminRoutes'); console.log('✅ adminRoutes cargado');
    // const treasuryRoutes = require('./routes/treasuryRoutes'); console.log('✅ treasuryRoutes cargado');
    
    console.log('✅✅✅ TODOS LOS ARCHIVOS DE RUTAS CARGADOS SIN ERRORES.'.bgGreen.black);
    
} catch (error) {
    console.error("‼️ ERROR DEFINITIVO ATRAPADO:".red.bold, error.message);
    console.error("--> El error `path-to-regexp` se originó durante la carga de un archivo de rutas.".red);
    console.error("--> El último archivo que intentó cargar antes de este mensaje es el CULPABLE.".red);
}