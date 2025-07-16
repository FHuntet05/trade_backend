// backend/index.js (VERSIÓN v16.2 - CONEXIÓN ROBUSTA)

const express = require('express');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf');
const morgan = 'morgan'; // Corregido: morgan es un string para el require, no una variable
const crypto = require('crypto');

console.log('[SISTEMA] Cargando variables de entorno...');
require('dotenv').config();

// Módulo de conexión a la BD
const connectDB = require('./config/db');

function checkEnvVariables() {
    console.log('[SISTEMA] Verificando variables de entorno críticas...');
    const requiredVars = ['MONGO_URI', 'JWT_SECRET', 'TELEGRAM_BOT_TOKEN', 'FRONTEND_URL', 'ADMIN_URL', 'BACKEND_URL', 'BSCSCAN_API_KEY', 'MASTER_SEED_PHRASE'];
    const missingVars = requiredVars.filter(v => !process.env[v]);
    if (missingVars.length > 0) {
        console.error(`!! ERROR FATAL: FALTAN VARIABLES DE ENTORNO: ${missingVars.join(', ')}`);
        process.exit(1);
    }
    console.log('[SISTEMA] Todas las variables de entorno críticas están presentes.');
}
checkEnvVariables();

// Conectar a la base de datos ANTES de definir nada más
connectDB();

console.log('[SISTEMA] Cargando módulos internos...');
const authRoutes = require('./routes/authRoutes');
const toolRoutes = require('./routes/toolRoutes');
const rankingRoutes = require('./routes/rankingRoutes');
const walletRoutes = require('./routes/walletRoutes');
const teamRoutes = require('./routes/teamRoutes');
const taskRoutes = require('./routes/taskRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const treasuryRoutes = require('./routes/treasuryRoutes');
const userRoutes = require('./routes/userRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
console.log('[SISTEMA] Módulos internos cargados.');

console.log('[SISTEMA] Inicializando aplicación...');
const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET || crypto.randomBytes(32).toString('hex');
const secretPath = `/api/telegram-webhook/${secretToken}`;
console.log(`[SISTEMA] Ruta secreta del webhook definida: ${secretPath}`);

const whitelist = [process.env.FRONTEND_URL, process.env.ADMIN_URL];
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || whitelist.indexOf(origin) !== -1) callback(null, true);
        else callback(new Error(`Origen no permitido: ${origin}`));
    },
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
    allowedHeaders: "Origin, X-Requested-With, Content-Type, Accept, Authorization"
};
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));
app.use(express.json());
app.use(require('morgan')('dev')); // Corregido: require morgan directamente

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Registro de Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/tools', toolRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/treasury', treasuryRoutes);
app.use('/api/users', userRoutes);
app.post(secretPath, (req, res) => bot.handleUpdate(req.body, res));
console.log('[SISTEMA] Rutas de API registradas.');

const WELCOME_MESSAGE = `*Bienvenido a NEURO LINK* 🚀\n\n¡Estás a punto de entrar a un nuevo ecosistema de minería digital!\n\nHaz clic en el botón de abajo para lanzar la aplicación.`;
const escapeMarkdownV2 = (text) => text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
bot.command('start', async (ctx) => {
    try {
        const telegramId = ctx.from.id.toString();
        const startPayload = ctx.startPayload ? ctx.startPayload.trim() : null;
        
        if (startPayload) {
            console.log(`[Bot] Usuario ${telegramId} ha llegado con el payload de referido: ${startPayload}`);
        }
        
        await ctx.replyWithMarkdownV2(escapeMarkdownV2(WELCOME_MESSAGE), Markup.inlineKeyboard([
            Markup.button.webApp('🚀 Abrir App', `${process.env.FRONTEND_URL}?ref=${startPayload || ''}`)
        ]));

    } catch (error) { 
        console.error('[Bot] Error en /start:', error.message, error); 
        await ctx.reply('Ocurrió un error al procesar tu solicitud. Por favor, intenta de nuevo más tarde.').catch(e => console.error('[Bot] Error al enviar mensaje de fallback:', e.message));
    }
});
bot.telegram.setMyCommands([{ command: 'start', description: 'Inicia la aplicación' }]);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, async () => {
    console.log(`[SERVIDOR] 🚀 Corriendo en puerto ${PORT}`);
    try {
        const botInfo = await bot.telegram.getMe();
        console.log(`[SERVIDOR] ✅ Conectado como bot: ${botInfo.username}.`);
        const webhookUrl = `${process.env.BACKEND_URL}${secretPath}`;
        console.log(`[SERVIDOR] 🔧 Configurando webhook en: ${webhookUrl}`);
        await bot.telegram.setWebhook(webhookUrl, { 
            secret_token: secretToken,
            drop_pending_updates: true
        });
        console.log('[SERVIDOR] ✅ Webhook configurado con token secreto.');
    } catch (telegramError) {
        console.error("[SERVIDOR] ERROR AL CONFIGURAR TELEGRAM:", telegramError.message);
    }
});

// Manejo de promesas no capturadas
process.on('unhandledRejection', (err, promise) => {
    console.error(`Error no manejado: ${err.message}`);
    server.close(() => process.exit(1));
});