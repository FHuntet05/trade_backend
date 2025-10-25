// RUTA: backend/index.js (VERSIÓN "NEXUS - VERCEL STABILITY FIX")

// --- IMPORTS Y CONFIGURACIÓN INICIAL ---
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf');
const morgan = require('morgan');
const crypto = require('crypto');
const dotenv = require('dotenv');
const colors = require('colors');
const connectDB = require('./config/db');
const User = require('./models/userModel');
const Tool = require('./models/toolModel');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

//const { initializePriceService } = require('./services/priceService');
//const { scheduleProfitDistribution } = require('./services/profitDistributionService');
//const { startMonitoring } = require('./services/blockchainWatcherService');

console.log('[SISTEMA] Iniciando AI Brok Trade Pro Backend...'.cyan);
dotenv.config();

function checkEnvVariables() {
    console.log('[SISTEMA] Verificando variables de entorno críticas...');
    const requiredVars = [
        'MONGO_URI', 'JWT_SECRET', 'JWT_ADMIN_SECRET', 'TELEGRAM_BOT_TOKEN', 
        'CLIENT_URL', 'BACKEND_URL', 'ANKR_RPC_URL', 'GAS_DISPENSER_PRIVATE_KEY',
        'TREASURY_WALLET_ADDRESS', 'SUPER_ADMIN_TELEGRAM_ID', 'MASTER_SEED_PHRASE',
        'TELEGRAM_WEBHOOK_SECRET' , 'CRON_SECRET'
    ];
    const envStatus = { missing: [], empty: [] };
    requiredVars.forEach(varName => {
        if (!(varName in process.env)) envStatus.missing.push(varName);
        else if (!process.env[varName]) envStatus.empty.push(varName);
    });
    if (envStatus.missing.length > 0 || envStatus.empty.length > 0) {
        let errorMessage = `Variables no definidas: ${envStatus.missing.join(', ')}\nVariables vacías: ${envStatus.empty.join(', ')}`;
        console.error(`!! ERROR FATAL: PROBLEMAS CON VARIABLES DE ENTORNO\n${errorMessage}`.red.bold);
        throw new Error(errorMessage);
    }
    console.log('[SISTEMA] ✅ Todas las variables de entorno críticas están presentes.');
}
checkEnvVariables();

// --- CONEXIÓN A BASE DE DATOS Y PROVISIÓN ---
connectDB();
provisionFreeTool();

// --- IMPORTACIÓN DE RUTAS DE LA API ---
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
const marketRoutes = require('./routes/marketRoutes');
const investmentRoutes = require('./routes/investmentRoutes');
const quantitativeRoutes = require('./routes/quantitativeRoutes');
const wheelRoutes = require('./routes/wheelRoutes');
const cronRoutes = require('./routes/cronRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// --- CONFIGURACIÓN DE EXPRESS ---
const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// --- MIDDLEWARES ---
app.set('trust proxy', 1);

const corsOptions = {
  origin: process.env.CLIENT_URL,
  credentials: true,
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  allowedHeaders: 'Content-Type,Authorization'
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json());
app.use(helmet());
app.use(morgan('dev'));
app.use((req, res, next) => {
    console.log(`[REQUEST LOG] Origen: ${req.headers.origin} | Método: ${req.method} | URL: ${req.url}`.magenta);
    next();
});
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false,
});
app.use((req, res, next) => {
    if (req.path.startsWith('/api/telegram-webhook')) return next();
    limiter(req, res, next);
});

// --- REGISTRO DE RUTAS DE LA API ---
app.get('/', (req, res) => res.json({ message: 'API de AI Brok Trade Pro funcionando en Vercel' }));
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/tools', toolRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/treasury', treasuryRoutes);
app.use('/api/user', userRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/investments', investmentRoutes);
app.use('/api/quantitative', quantitativeRoutes);
app.use('/api/wheel', wheelRoutes);
app.use('/api/cron', cronRoutes);

// --- LÓGICA DEL BOT DE TELEGRAM ---
const WELCOME_MESSAGE = `
🤖✨ ¡Bienvenido a AI Brok Trade Pro! ✨🤖
Descubre una nueva era de trading inteligente... (mensaje completo omitido por brevedad)
`;
bot.command('start', async (ctx) => {
    try {
        const referredId = ctx.from.id.toString();
        let referrerId = ctx.startPayload ? ctx.startPayload.trim() : (ctx.message.text.split(' ')[1] || null);
        let referredUser = await User.findOne({ telegramId: referredId });
        if (!referredUser) {
            const username = ctx.from.username || `user_${referredId}`;
            const fullName = `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim();
            referredUser = new User({ 
                telegramId: referredId, username, fullName: fullName || username, language: ctx.from.language_code || 'es' 
            });
        }
        const canBeReferred = referrerId && referrerId !== referredId && !referredUser.referredBy;
        if (canBeReferred) {
            const referrerUser = await User.findOne({ telegramId: referrerId });
            if (referrerUser) {
                referredUser.referredBy = referrerUser._id;
                if (!referrerUser.referrals.some(ref => ref.user.equals(referredUser._id))) {
                    referrerUser.referrals.push({ level: 1, user: referredUser._id });
                    await referrerUser.save();
                }
            }
        }
        await referredUser.save();
        const imageUrl = 'https://i.postimg.cc/XqqqFR0C/photo-2025-09-20-02-42-29.jpg';
        const webAppUrl = process.env.CLIENT_URL;
        await ctx.replyWithPhoto(imageUrl, {
            caption: WELCOME_MESSAGE, parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[ Markup.button.webApp('🚀 Abrir App', webAppUrl) ]] }
        });
    } catch (error) {
        console.error('[Bot /start] ERROR FATAL EN EL COMANDO START:'.red.bold, error);
        try {
            await ctx.reply('Lo siento, ha ocurrido un error. Por favor, intenta nuevamente más tarde.');
        } catch (replyError) {
            console.error('[Bot /start] Error al enviar mensaje de error al usuario:', replyError);
        }
    }
});

// --- MANEJADOR DE WEBHOOK PARA VERCEL ---
const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
const secretPath = `/api/telegram-webhook/${secretToken}`;
app.post(secretPath, (req, res) => {
    bot.handleUpdate(req.body, res);
});

// --- INICIALIZACIÓN DEL SERVIDOR Y SERVICIOS ---
const server = http.createServer(app);

// --- INICIO DE LA CORRECCIÓN CRÍTICA (VERCEL) ---
// Los procesos persistentes como 'node-cron', 'setInterval' o clientes WebSocket
// permanentes no son compatibles con el ciclo de vida de las funciones Serverless de Vercel.
// Al intentar iniciarlos, la función crashea (FUNCTION_INVOCATION_FAILED).
// La solución correcta es migrar estas tareas a "Vercel Cron Jobs".

// console.log('[SISTEMA] Desactivando servicios de larga duración para compatibilidad con Vercel.'.yellow);

// initializePriceService(server); // DESACTIVADO: La conexión WebSocket persistente causa inestabilidad.
// startMonitoring(); // DESACTIVADO: setInterval no funciona en Serverless. Usar Vercel Cron Jobs.
// scheduleProfitDistribution(); // DESACTIVADO: node-cron no funciona en Serverless. Usar Vercel Cron Jobs.

// CONSEJO DE ARQUITECTURA:
// Para reactivar estas funcionalidades en Vercel, debes:
// 1. Crear endpoints de API seguros para cada tarea. Ejemplo: GET /api/cron/distribute-profits
// 2. En tu archivo `vercel.json`, configurar los Cron Jobs para que llamen a estos endpoints
//    en el horario deseado. Ejemplo: "schedule": "5 0 * * *"
// --- FIN DE LA CORRECCIÓN CRÍTICA (VERCEL) ---


// --- MIDDLEWARE DE ERRORES (deben ir al final) ---
app.use(notFound);
app.use(errorHandler);

// --- EXPORTACIÓN PARA VERCEL ---
// Se exporta 'app' o 'server' para que Vercel lo maneje.
// 'app' es suficiente si no se usan WebSockets de forma nativa en la misma instancia.
module.exports = app;

// --- Funciones auxiliares ---
async function provisionFreeTool() {
    try {
        const freeToolExists = await Tool.findOne({ isFree: true });
        if (freeToolExists) return;
        const newFreeTool = new Tool({
            name: "Miner Gratuito de Inicio", vipLevel: 0, price: 0, miningBoost: 500,
            durationDays: 5, imageUrl: "https://i.postimg.cc/pLgD5gYq/free-miner.png", isFree: true,
        });
        await newFreeTool.save();
        console.log('[SISTEMA] Herramienta gratuita provisionada.'.green);
    } catch (error) {
        console.error('❌ Error al provisionar la herramienta gratuita:', error);
    }
}