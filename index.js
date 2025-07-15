// backend/index.js (VERSIÓN FINAL, COMPLETA Y ORDENADA)

// -----------------------------------------------------------------------------
// 1. IMPORTACIONES
// -----------------------------------------------------------------------------
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();
require('colors'); // Para logs de consola coloridos (npm install colors)

// --- Carga preventiva de modelos de Mongoose ---
// Esto previene errores de "Schema hasn't been registered"
require('./models/userModel');
require('./models/toolModel');
require('./models/transactionModel');
require('./models/settingsModel');
require('./models/cryptoWalletModel');
const PendingReferral = require('./models/pendingReferralModel');

// --- Importación de Servicios ---
const { startMonitoring } = require('./services/transactionMonitor');
const { startPriceService } = require('./services/priceService');

// --- Importación de Rutas ---
const authRoutes = require('./routes/authRoutes');
const toolRoutes = require('./routes/toolRoutes');
const rankingRoutes = require('./routes/rankingRoutes');
const walletRoutes = require('./routes/walletRoutes');
const teamRoutes = require('./routes/teamRoutes');
const taskRoutes = require('./routes/taskRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const treasuryRoutes = require('./routes/treasuryRoutes');

// --- Importación de Middlewares de Manejo de Errores ---
// Estos son cruciales para evitar que las peticiones se queden colgadas
const { notFound, errorHandler } = require('./middleware/errorMiddleware');


// -----------------------------------------------------------------------------
// 2. INICIALIZACIÓN Y CONFIGURACIÓN
// -----------------------------------------------------------------------------
const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// --- Configuración de Middlewares de Express ---
// El orden es importante: CORS -> JSON Parser -> RUTAS -> Error Handlers
app.use(cors());       // Habilita Cross-Origin Resource Sharing
app.use(express.json()); // Permite al servidor aceptar y parsear JSON en el body de las peticiones

// -----------------------------------------------------------------------------
// 3. DEFINICIÓN DE RUTAS DE LA API
// -----------------------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/tools', toolRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/treasury', treasuryRoutes);

// --- Ruta especial para el Webhook de Telegram ---
const secretPath = `/api/telegram-webhook/${bot.secretPathComponent()}`;
app.post(secretPath, (req, res) => {
    // Pasa la petición directamente al manejador de Telegraf
    bot.handleUpdate(req.body, res);
});


// -----------------------------------------------------------------------------
// 4. LÓGICA DEL BOT DE TELEGRAM
// -----------------------------------------------------------------------------
const WELCOME_MESSAGE =
  `*Bienvenido a NEURO LINK* 🚀\n\n` +
  `¡Estás a punto de entrar a un nuevo ecosistema de minería digital!\n\n` +
  `*¿Qué puedes hacer aquí?*\n` +
  `🔹 *Minar:* Activa tu ciclo de minado diario para ganar tokens NTX.\n` +
  `🔹 *Mejorar:* Adquiere herramientas para aumentar tu velocidad de minería.\n` +
  `🔹 *Crecer:* Invita a tus amigos y gana comisiones por su actividad.\n\n` +
  `Haz clic en el botón de abajo para lanzar la aplicación y empezar tu viaje.`;

// Función de utilidad para escapar caracteres especiales de MarkdownV2
function escapeMarkdownV2(text) {
  const charsToEscape = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
  return charsToEscape.reduce((acc, char) => acc.replace(new RegExp('\\' + char, 'g'), '\\' + char), text);
}

bot.command('start', async (ctx) => {
    try {
        const newUserId = ctx.from.id.toString();
        const startPayload = ctx.startPayload ? ctx.startPayload.trim() : null;
        if (startPayload && startPayload !== newUserId) {
            await PendingReferral.updateOne(
                { newUserId: newUserId }, 
                { $set: { referrerId: startPayload, createdAt: new Date() } }, 
                { upsert: true }
            );
        }
        await ctx.replyWithMarkdownV2(
            escapeMarkdownV2(WELCOME_MESSAGE),
            Markup.inlineKeyboard([
              [Markup.button.webApp('🚀 Abrir App', process.env.FRONTEND_URL)]
            ])
        );
    } catch (error) {
        console.error('[Bot] Error en el comando /start:'.red, error.message);
    }
});

bot.telegram.setMyCommands([
    { command: 'start', description: 'Inicia o reinicia la aplicación' }
]);


// -----------------------------------------------------------------------------
// 5. MANEJO DE ERRORES GLOBALES
// -----------------------------------------------------------------------------
// Estos deben ser los ÚLTIMOS middlewares en ser añadidos.
// Si ninguna ruta anterior coincide, se ejecutará `notFound`.
app.use(notFound);
// Si cualquier ruta anterior lanza un error, se ejecutará `errorHandler`.
app.use(errorHandler);


// -----------------------------------------------------------------------------
// 6. FUNCIÓN DE ARRANQUE DEL SERVIDOR
// -----------------------------------------------------------------------------
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function startServer() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Conexión a MongoDB exitosa.'.green.bold);
        
        // Iniciar servicios de fondo
        await startPriceService();
        startMonitoring();

        const PORT = process.env.PORT || 5000;
        app.listen(PORT, async () => {
            console.log(`🚀 Servidor Express corriendo en el puerto ${PORT}`.cyan.bold);
            
            // Configuración del Webhook de Telegram después de que el servidor esté escuchando
            try {
                console.log('⏳ Esperando 10 segundos para estabilizar...'.yellow);
                await sleep(10000);
                
                const botInfo = await bot.telegram.getMe();
                console.log(`✅ Conectado como bot: ${botInfo.username}.`.blue);

                console.log('🔧 Limpiando webhook anterior...'.yellow);
                await bot.telegram.deleteWebhook({ drop_pending_updates: true });

                const webhookUrl = `${process.env.BACKEND_URL}${secretPath}`;
                console.log('🔧 Registrando nuevo webhook en:'.yellow, webhookUrl);
                await bot.telegram.setWebhook(webhookUrl);

                console.log(`✅ Webhook configurado exitosamente.`.green.bold);
            } catch (webhookError) {
                console.error("‼️ ERROR CRÍTICO AL CONFIGURAR TELEGRAM:".red.bold, webhookError.message);
            }
        });

    } catch (error) {
        console.error("‼️ ERROR FATAL DURANTE EL ARRANQUE:".red.bold, error.message);
        process.exit(1); // Detiene la aplicación si no se puede conectar a la DB
    }
}

// Iniciar el servidor
startServer();