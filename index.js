// backend/index.js (VERSIÓN DE PRODUCCIÓN - REFINADA Y COMENTADA)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const PendingReferral = require('./models/pendingReferralModel');

// Importación de servicios y modelos
const { startMonitoring } = require('./services/transactionMonitor'); 
const { startPriceService } = require('./services/priceService');
const Price = require('./models/priceModel');

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// --- 1. CONFIGURACIÓN DE MIDDLEWARE ---
// Permite solicitudes de diferentes orígenes (nuestro frontend)
app.use(cors());
// Permite al servidor entender y procesar JSON en los bodies de las peticiones
app.use(express.json());


// --- 2. REGISTRO DE RUTAS DE LA API ---
// Centralizamos todas las rutas de la aplicación para una mejor organización.
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/tools', require('./routes/toolRoutes'));
app.use('/api/ranking', require('./routes/rankingRoutes'));
app.use('/api/wallet', require('./routes/walletRoutes'));
app.use('/api/team', require('./routes/teamRoutes'));
app.use('/api/tasks', require('./routes/taskRoutes'));
app.use('/api/payment', require('./routes/paymentRoutes'));
app.use('/api/admin',  require('./routes/adminRoutes'));


// --- 3. LÓGICA DEL BOT DE TELEGRAM ---
// Generamos una ruta secreta y única para el webhook para añadir seguridad.
const secretPath = `/api/telegram-webhook/${bot.secretPathComponent()}`;

// Endpoint que recibe las actualizaciones de Telegram (modo Webhook)
app.post(secretPath, (req, res) => {
    bot.handleUpdate(req.body, res);
});

// Mensaje de bienvenida mejorado
const WELCOME_MESSAGE = 
  `*Bienvenido a NEURO LINK* 🚀\n\n` +
  `¡Estás a punto de entrar a un nuevo ecosistema de minería digital!\n\n` +
  `*¿Qué puedes hacer aquí?*\n` +
  `🔹 *Minar:* Activa tu ciclo de minado diario para ganar tokens NTX\\.\n` +
  `🔹 *Mejorar:* Adquiere herramientas para aumentar tu velocidad de minería\\.\n` +
  `🔹 *Crecer:* Invita a tus amigos y gana comisiones por su actividad\\.\n\n` +
  `Haz clic en el botón de abajo para lanzar la aplicación y empezar tu viaje\\.`;

// Comando /start: El punto de entrada para todos los usuarios.
bot.command('start', async (ctx) => {
    try {
        const newUserId = ctx.from.id.toString();
        const startPayload = ctx.startPayload ? ctx.startPayload.trim() : null;

        // Lógica de referidos robustecida
        if (startPayload && startPayload !== newUserId) {
            await PendingReferral.updateOne(
                { newUserId: newUserId },
                { $set: { referrerId: startPayload, createdAt: new Date() } },
                { upsert: true }
            );
        }
        
        // Enviamos la respuesta con formato MarkdownV2
        await ctx.replyWithMarkdownV2(
            WELCOME_MESSAGE.replace(/\./g, '\\.'), // Escapamos los puntos para MarkdownV2
            Markup.inlineKeyboard([
              [Markup.button.webApp('🚀 Abrir App', process.env.FRONTEND_URL)]
            ])
        );
    } catch (error) {
        console.error('[Bot] Error en el comando /start:', error);
    }
});

// Configuración del menú persistente del bot
bot.telegram.setMyCommands([
    { command: 'start', description: 'Inicia o reinicia la aplicación' }
]);


// --- 4. FUNCIÓN PRINCIPAL DE ARRANQUE DEL SERVIDOR ---

// Función auxiliar para crear una pausa (utilizada para el registro del webhook)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function startServer() {
    try {
        // Conexión a la base de datos MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Conexión a MongoDB exitosa.');

        // Inicialización del servicio de precios con fallback
        const pricesLoaded = await startPriceService();
        if (!pricesLoaded) {
            const oldPricesCount = await Price.countDocuments();
            if (oldPricesCount < 3) {
                throw new Error("Servicio de precios falló y no hay datos de respaldo.");
            }
            console.warn("⚠️ ADVERTENCIA: No se pudo contactar a CoinGecko. Usando precios de la BD.");
        } else {
            console.log("✅ Servicio de precios inicializado.");
        }
        
        // Inicialización del monitor de transacciones en segundo plano
        startMonitoring();
        console.log("✅ Monitor de transacciones iniciado.");

        // Arranque del servidor Express
        const PORT = process.env.PORT || 5000;
        app.listen(PORT, async () => {
            console.log(`🚀 Servidor Express corriendo en el puerto ${PORT}`);

            // Configuración del Webhook de Telegram
            try {
                // Pequeña pausa para asegurar la propagación del DNS en entornos como Render
                await sleep(2000); 
                const webhookUrl = `${process.env.BACKEND_URL}${secretPath}`;
                await bot.telegram.setWebhook(webhookUrl);
                console.log(`✅ Webhook de Telegram configurado en: ${webhookUrl}`);
                console.log("🤖 El sistema está 100% operativo en modo Webhook.");
            } catch (webhookError) {
                console.error("‼️ ERROR CRÍTICO: No se pudo configurar el Webhook de Telegram.", webhookError.message);
            }
        });

    } catch (error) {
        console.error("‼️ ERROR FATAL DURANTE EL ARRANQUE:", error.message);
        process.exit(1); // Detiene el proceso si ocurre un error irrecuperable
    }
}

// Ejecutar la función de arranque principal.
startServer();