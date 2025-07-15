// backend/index.js (CORREGIDO - Webhook más robusto)
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
app.use(cors());
app.use(express.json());


// --- 2. REGISTRO DE RUTAS DE LA API ---
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/tools', require('./routes/toolRoutes'));
app.use('/api/ranking', require('./routes/rankingRoutes'));
app.use('/api/wallet', require('./routes/walletRoutes'));
app.use('/api/team', require('./routes/teamRoutes'));
app.use('/api/tasks', require('./routes/taskRoutes'));
app.use('/api/payment', require('./routes/paymentRoutes'));
app.use('/api/admin',  require('./routes/adminRoutes'));


// --- 3. LÓGICA DEL BOT DE TELEGRAM ---
const secretPath = `/api/telegram-webhook/${bot.secretPathComponent()}`;
app.post(secretPath, (req, res) => {
    bot.handleUpdate(req.body, res);
});

const WELCOME_MESSAGE = 
  `*Bienvenido a NEURO LINK* 🚀\n\n` +
  `¡Estás a punto de entrar a un nuevo ecosistema de minería digital!\n\n` +
  `*¿Qué puedes hacer aquí?*\n` +
  `🔹 *Minar:* Activa tu ciclo de minado diario para ganar tokens NTX\\.\n` +
  `🔹 *Mejorar:* Adquiere herramientas para aumentar tu velocidad de minería\\.\n` +
  `🔹 *Crecer:* Invita a tus amigos y gana comisiones por su actividad\\.\n\n` +
  `Haz clic en el botón de abajo para lanzar la aplicación y empezar tu viaje\\.`;

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
            WELCOME_MESSAGE.replace(/\./g, '\\.'),
            Markup.inlineKeyboard([
              [Markup.button.webApp('🚀 Abrir App', process.env.FRONTEND_URL)]
            ])
        );
    } catch (error) {
        console.error('[Bot] Error en el comando /start:', error);
    }
});

bot.telegram.setMyCommands([
    { command: 'start', description: 'Inicia o reinicia la aplicación' }
]);


// --- 4. FUNCIÓN PRINCIPAL DE ARRANQUE DEL SERVIDOR ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function startServer() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Conexión a MongoDB exitosa.');
        
        await startPriceService();
        startMonitoring();

        const PORT = process.env.PORT || 5000;
        app.listen(PORT, async () => {
            console.log(`🚀 Servidor Express corriendo en el puerto ${PORT}`);

            try {
                console.log('⏳ Esperando 10 segundos para la estabilización del DNS...');
                await sleep(10000);

                // --- CORRECCIÓN CLAVE ---
                // Eliminamos cualquier webhook antiguo para asegurar un estado limpio.
                console.log('🔧 Limpiando configuración de webhook anterior...');
                await bot.telegram.deleteWebhook({ drop_pending_updates: true });

                const webhookUrl = `${process.env.BACKEND_URL}${secretPath}`;
                console.log('🔧 Intentando registrar el nuevo webhook en la URL:', webhookUrl);
                await bot.telegram.setWebhook(webhookUrl);

                console.log(`✅ Webhook de Telegram configurado exitosamente.`);
                console.log("🤖 El sistema está 100% operativo en modo Webhook.");
            } catch (webhookError) {
                console.error("‼️ ERROR CRÍTICO: No se pudo configurar el Webhook de Telegram.");
                console.error("-> Mensaje de Error:", webhookError.message);
            }
        });

    } catch (error) {
        console.error("‼️ ERROR FATAL DURANTE EL ARRANQUE:", error.message);
        process.exit(1);
    }
}

startServer();