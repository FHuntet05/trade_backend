// backend/index.js (VERSIÓN FINAL OPTIMIZADA PARA VERCEL)

// --- IMPORTS Y CONFIGURACIÓN INICIAL ---
const express = require('express');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf');
const dotenv = require('dotenv');
const colors = require('colors');
const connectDB = require('./config/db');
const User = require('./models/userModel');
const Tool = require('./models/toolModel');
// const { startMonitoring } = require('./services/transactionMonitor.js'); // Desactivado para Vercel
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

console.log('[SISTEMA] Iniciando función serverless de BLOCKSPHERE...');
dotenv.config();

function checkEnvVariables() {
    console.log('[SISTEMA] Verificando variables de entorno críticas...');
    const requiredVars = [
        'MONGO_URI', 'JWT_SECRET', 'JWT_ADMIN_SECRET', 'TELEGRAM_BOT_TOKEN', 
        'CLIENT_URL', 'BACKEND_URL', 'ANKR_RPC_URL', 'GAS_DISPENSER_PRIVATE_KEY',
        'TREASURY_WALLET_ADDRESS', 'SUPER_ADMIN_TELEGRAM_ID', 'MASTER_SEED_PHRASE',
        'TELEGRAM_WEBHOOK_SECRET'
    ];
    const missingVars = requiredVars.filter(v => !process.env[v]);
    if (missingVars.length > 0) {
        console.error(`!! ERROR FATAL: FALTAN VARIABLES DE ENTORNO: ${missingVars.join(', ')}`.red.bold);
        throw new Error(`Variables de entorno faltantes: ${missingVars.join(', ')}`);
    }
    console.log('[SISTEMA] ✅ Todas las variables de entorno críticas están presentes.');
}
checkEnvVariables();

// --- CONEXIÓN A BASE DE DATOS ---
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
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// --- CONFIGURACIÓN DE EXPRESS ---
const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

app.set('trust proxy', 1);
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(helmet());

// --- REGISTRO DE RUTAS DE LA API ---
// Nota: Tu vercel.json actual enrutará todo a este archivo.
// Vercel maneja las rutas de forma inteligente.
app.get('/', (req, res) => res.json({ message: 'API de BlockSphere funcionando en Vercel' }));
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
app.use('/api/users', userRoutes);

// --- LÓGICA DEL BOT DE TELEGRAM ---
const WELCOME_MESSAGE = `
🌐🚀 NEW PROJECT: BlockSphere 🚀🌐\n\n  
// ... (tu mensaje de bienvenida completo aquí)
`;

bot.command('start', async (ctx) => {
    try {
        const referredId = ctx.from.id.toString();
        let referrerId = ctx.startPayload ? ctx.startPayload.trim() : (ctx.message.text.split(' ')[1] || null);
        
        let referredUser = await User.findOne({ telegramId: referredId });
        if (!referredUser) {
            const username = ctx.from.username || `user_${referredId}`;
            const fullName = `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim();
            referredUser = new User({ telegramId: referredId, username, fullName: fullName || username, language: ctx.from.language_code || 'es' });
        }

        const canBeReferred = referrerId && referrerId !== referredId && !referredUser.referredBy;

        if (canBeReferred) {
            const referrerUser = await User.findOne({ telegramId: referrerId });
            if (referrerUser) {
                referredUser.referredBy = referrerUser._id;
                const isAlreadyReferred = referrerUser.referrals.some(ref => ref.user.equals(referredUser._id));
                if (!isAlreadyReferred) {
                    referrerUser.referrals.push({ level: 1, user: referredUser._id });
                    await referrerUser.save();
                }
            }
        }

        await referredUser.save();
        
        const imageUrl = 'https://i.postimg.cc/XqqqFR0C/photo-2025-09-20-02-42-29.jpg';
        const webAppUrl = process.env.CLIENT_URL;
        
        await ctx.replyWithPhoto(imageUrl, {
            caption: WELCOME_MESSAGE,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [ Markup.button.webApp('🚀 Abrir App', webAppUrl) ]
                ]
            }
        });

    } catch (error) {
        console.error('[Bot /start] ERROR FATAL EN EL COMANDO START:'.red.bold, error);
    }
});

// ======================= WEBHOOK HANDLER PARA VERCEL =======================
const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
const secretPath = `/api/telegram-webhook/${secretToken}`;

// Este endpoint recibe las actualizaciones de Telegram
app.post(secretPath, (req, res) => {
    console.log('[Webhook] Petición recibida de Telegram.');
    bot.handleUpdate(req.body, res);
});
// ===========================================================================


// --- MONITOREO DE TRANSACCIONES (ADVERTENCIA) ---
// La función `setInterval` de `startMonitoring` no es fiable en Vercel.
// Para esto, la forma correcta es usar "Cron Jobs" en Vercel.
// Por ahora, se desactiva para asegurar que el despliegue principal funcione.
// startMonitoring();


// --- MIDDLEWARE DE ERRORES (deben ir al final) ---
app.use(notFound);
app.use(errorHandler);

// --- EXPORTACIÓN PARA VERCEL (EL CAMBIO MÁS IMPORTANTE) ---
// NO usamos app.listen. Exportamos la app para que Vercel la maneje.
module.exports = app;

// --- Funciones auxiliares ---
async function provisionFreeTool() {
    try {
        const freeToolExists = await Tool.findOne({ isFree: true });
        if (freeToolExists) { return; }
        const newFreeTool = new Tool({
            name: "Miner Gratuito de Inicio", vipLevel: 0, price: 0, miningBoost: 500,
            durationDays: 5, imageUrl: "https://i.postimg.cc/pLgD5gYq/free-miner.png", isFree: true,
        });
        await newFreeTool.save();
    } catch (error) {
        console.error('❌ Error al provisionar la herramienta gratuita:', error);
    }
}