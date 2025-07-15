// backend/index.js (VERSIÓN FINAL Y ESTABLE v14.0 - Sin dependencia 'colors')

// -----------------------------------------------------------------------------
// 1. IMPORTACIONES
// -----------------------------------------------------------------------------
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf');
const morgan = require('morgan');
require('dotenv').config();
// require('colors'); // <-- DEPENDENCIA PROBLEMÁTICA ELIMINADA

// --- Carga preventiva de modelos de Mongoose ---
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
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// -----------------------------------------------------------------------------
// 2. INICIALIZACIÓN Y CONFIGURACIÓN
// -----------------------------------------------------------------------------
const app = express();

if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error("ERROR FATAL: La variable de entorno TELEGRAM_BOT_TOKEN no está definida.");
    process.exit(1);
}
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// --- Configuración de CORS Avanzada y Específica ---
const whitelist = [process.env.FRONTEND_URL, process.env.ADMIN_URL].filter(Boolean);
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || whitelist.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error(`El origen '${origin}' no está permitido por CORS.`));
        }
    },
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
    allowedHeaders: "Origin, X-Requested-With, Content-Type, Accept, Authorization"
};
app.options('*', cors(corsOptions)); 
app.use(cors(corsOptions));

app.use(express.json());
app.use(morgan('dev'));

// -----------------------------------------------------------------------------
// 3. DEFINICIÓN DE RUTAS DE LA API
// -----------------------------------------------------------------------------
const secretPath = `/api/telegram-webhook/${bot.secretPathComponent()}`;

app.get('/health', (req, res) => {
    console.log(`[HEALTH CHECK] Ruta /health alcanzada a las ${new Date().toISOString()}`);
    res.status(200).json({ status: 'ok', time: new Date() });
});

app.use('/api/auth', authRoutes);
app.use('/api/tools', toolRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/treasury', treasuryRoutes);

app.post(secretPath, (req, res) => {
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

function escapeMarkdownV2(text) {
  const charsToEscape = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
  return charsToEscape.reduce((acc, char) => acc.replace(new RegExp('\\' + char, 'g'), '\\' + char), text);
}

bot.command('start', async (ctx) => {
    try {
        const newUserId = ctx.from.id.toString();
        const startPayload = ctx.startPayload ? ctx.startPayload.trim() : null;
        if (startPayload && startPayload !== newUserId) {
            await PendingReferral.updateOne({ newUserId }, { $set: { referrerId: startPayload, createdAt: new Date() } }, { upsert: true });
        }
        await ctx.replyWithMarkdownV2(
            escapeMarkdownV2(WELCOME_MESSAGE),
            Markup.inlineKeyboard([ [Markup.button.webApp('🚀 Abrir App', process.env.FRONTEND_URL)] ])
        );
    } catch (error) {
        console.error('[Bot] Error en el comando /start:', error.message);
    }
});

bot.telegram.setMyCommands([
    { command: 'start', description: 'Inicia o reinicia la aplicación' }
]);

// -----------------------------------------------------------------------------
// 5. MANEJO DE ERRORES GLOBALES
// -----------------------------------------------------------------------------
app.use(notFound);
app.use(errorHandler);

// -----------------------------------------------------------------------------
// 6. FUNCIÓN DE ARRANQUE DEL SERVIDOR
// -----------------------------------------------------------------------------
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function startServer() {
    try {
        console.log('Intentando conectar a MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Conexión a MongoDB exitosa.');
        
        await startPriceService();
        startMonitoring();

        const PORT = process.env.PORT || 5000;
        app.listen(PORT, async () => {
            console.log(`🚀 Servidor Express corriendo en el puerto ${PORT}`);
            
            try {
                const botInfo = await bot.telegram.getMe();
                console.log(`✅ Conectado como bot: ${botInfo.username}.`);

                const webhookUrl = `${process.env.BACKEND_URL}${secretPath}`;
                console.log(`🔧 Configurando webhook en: ${webhookUrl}`);
                
                await sleep(2000); 
                
                await bot.telegram.setWebhook(webhookUrl, { drop_pending_updates: true });
                console.log(`✅ Webhook configurado exitosamente.`);

            } catch (telegramError) {
                console.error("ERROR CRÍTICO AL CONFIGURAR TELEGRAM:", telegramError.message);
                console.log("--> Verifique que el TELEGRAM_BOT_TOKEN es correcto y que la URL del backend es accesible públicamente.");
            }
        });

    } catch (error) {
        console.error("ERROR FATAL DURANTE EL ARRANQUE:", error.message);
        console.error(error);
        process.exit(1);
    }
}

startServer();