// backend/index.js (VERSIÓN FINAL, BLINDADA Y DE PRODUCCIÓN v14.0)

// -----------------------------------------------------------------------------
// [ETAPA 1] CARGA DE DEPENDENCIAS Y VARIABLES DE ENTORNO
// -----------------------------------------------------------------------------
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf');
const morgan = require('morgan');

console.log('[SISTEMA] Cargando variables de entorno...');
require('dotenv').config();

// --- FUNCIÓN CRÍTICA: VERIFICACIÓN DEL ENTORNO ---
function checkEnvVariables() {
    console.log('[SISTEMA] Verificando variables de entorno críticas...');
    const requiredVars = [
        'MONGO_URI',
        'JWT_SECRET',
        'TELEGRAM_BOT_TOKEN',
        'FRONTEND_URL',
        'ADMIN_URL',
        'BACKEND_URL',
        'BSCSCAN_API_KEY',
        'MASTER_SEED_PHRASE'
    ];
    const missingVars = requiredVars.filter(v => !process.env[v]);

    if (missingVars.length > 0) {
        console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        console.error('!! ERROR FATAL: FALTAN VARIABLES DE ENTORNO ESENCIALES !!');
        console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        console.error(`--> Revisa tu configuración en Render. Faltan las siguientes variables: ${missingVars.join(', ')}`);
        process.exit(1); // Detiene el servidor INMEDIATAMENTE
    }
    console.log('[SISTEMA] Todas las variables de entorno críticas están presentes.');
}

checkEnvVariables(); // Ejecutamos la verificación al inicio

// -----------------------------------------------------------------------------
// [ETAPA 2] CARGA DE MÓDULOS DEL PROYECTO
// -----------------------------------------------------------------------------
console.log('[SISTEMA] Cargando módulos internos (rutas, modelos, servicios)...');
// --- Carga de Modelos y Servicios ---
require('./models/userModel'); // Carga todos los modelos necesarios...
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
// --- Middlewares de Error ---
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
console.log('[SISTEMA] Módulos internos cargados correctamente.');


// -----------------------------------------------------------------------------
// [ETAPA 3] INICIALIZACIÓN DE LA APLICACIÓN EXPRESS Y TELEGRAF
// -----------------------------------------------------------------------------
console.log('[SISTEMA] Inicializando Express y Telegraf...');
const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// --- Configuración de CORS Avanzada ---
const whitelist = [process.env.FRONTEND_URL, process.env.ADMIN_URL];
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || whitelist.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error(`Origen no permitido por CORS: ${origin}`));
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
console.log('[SISTEMA] Middlewares de Express configurados.');

// --- Definición de Rutas de la API ---
const secretPath = `/api/telegram-webhook/${bot.secretPathComponent()}`;
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', time: new Date() }));
app.use('/api/auth', authRoutes);
app.use('/api/tools', toolRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/treasury', treasuryRoutes);
app.post(secretPath, (req, res) => bot.handleUpdate(req.body, res));
console.log('[SISTEMA] Rutas de la API registradas.');


// --- Lógica del Bot de Telegram ---
const WELCOME_MESSAGE = `*Bienvenido a NEURO LINK* 🚀\n\n¡Estás a punto de entrar a un nuevo ecosistema de minería digital!\n\nHaz clic en el botón de abajo para lanzar la aplicación.`;
const escapeMarkdownV2 = (text) => text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
bot.command('start', async (ctx) => {
    try {
        const newUserId = ctx.from.id.toString();
        const startPayload = ctx.startPayload ? ctx.startPayload.trim() : null;
        if (startPayload && startPayload !== newUserId) {
            await PendingReferral.updateOne({ newUserId }, { $set: { referrerId: startPayload, createdAt: new Date() } }, { upsert: true });
        }
        await ctx.replyWithMarkdownV2(escapeMarkdownV2(WELCOME_MESSAGE), Markup.inlineKeyboard([Markup.button.webApp('🚀 Abrir App', process.env.FRONTEND_URL)]));
    } catch (error) { console.error('[Bot] Error en /start:', error.message); }
});
bot.telegram.setMyCommands([{ command: 'start', description: 'Inicia la aplicación' }]);

// --- Manejo de Errores Globales ---
app.use(notFound);
app.use(errorHandler);

// -----------------------------------------------------------------------------
// [ETAPA 4] ARRANQUE DEL SERVIDOR
// -----------------------------------------------------------------------------
async function startServer() {
    try {
        console.log('[SERVIDOR] Intentando conectar a MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('[SERVIDOR] ✅ Conexión a MongoDB exitosa.');
        
        await startPriceService();
        startMonitoring();

        const PORT = process.env.PORT || 5000;
        app.listen(PORT, async () => {
            console.log(`[SERVIDOR] 🚀 Servidor Express corriendo en el puerto ${PORT}`);
            try {
                const botInfo = await bot.telegram.getMe();
                console.log(`[SERVIDOR] ✅ Conectado como bot: ${botInfo.username}.`);
                const webhookUrl = `${process.env.BACKEND_URL}${secretPath}`;
                console.log(`[SERVIDOR] 🔧 Configurando webhook en: ${webhookUrl}`);
                await bot.telegram.setWebhook(webhookUrl, { drop_pending_updates: true });
                console.log('[SERVIDOR] ✅ Webhook configurado exitosamente.');
            } catch (telegramError) {
                console.error("[SERVIDOR] ERROR AL CONFIGURAR TELEGRAM:", telegramError.message);
            }
        });
    } catch (error) {
        console.error("[SERVIDOR] ‼️ ERROR FATAL DURANTE EL ARRANQUE:", error.message);
        console.error(error); // Imprime el stack trace completo del error
        process.exit(1);
    }
}

console.log('[SISTEMA] Iniciando secuencia de arranque del servidor...');
startServer();
