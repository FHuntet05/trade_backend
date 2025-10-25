// RUTA: backend/index.js (VERSIÓN "NEXUS - QUANTITATIVE MODULE INTEGRATED")

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
const { initializePriceService } = require('./services/priceService');
const { scheduleProfitDistribution } = require('./services/profitDistributionService');
const { startMonitoring } = require('./services/blockchainWatcherService');

console.log('[SISTEMA] Iniciando función serverless de AI Brok Trade Pro...'.cyan);
dotenv.config();

function checkEnvVariables() {
    console.log('[SISTEMA] Verificando variables de entorno críticas...');
    const requiredVars = [
        'MONGO_URI', 'JWT_SECRET', 'JWT_ADMIN_SECRET', 'TELEGRAM_BOT_TOKEN', 
        'CLIENT_URL', 'BACKEND_URL', 'ANKR_RPC_URL', 'GAS_DISPENSER_PRIVATE_KEY',
        'TREASURY_WALLET_ADDRESS', 'SUPER_ADMIN_TELEGRAM_ID', 'MASTER_SEED_PHRASE',
        'TELEGRAM_WEBHOOK_SECRET'
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
// --- INICIO DE LA MODIFICACIÓN (Módulo 2.3) ---
const quantitativeRoutes = require('./routes/quantitativeRoutes'); // Se importa el nuevo archivo de rutas
// --- FIN DE LA MODIFICACIÓN (Módulo 2.3) ---
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// --- CONFIGURACIÓN DE EXPRESS ---
const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// --- MIDDLEWARES ---
app.set('trust proxy', 1);
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
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
// --- INICIO DE LA MODIFICACIÓN (Módulo 2.3) ---
app.use('/api/quantitative', quantitativeRoutes); // Se registra el nuevo grupo de rutas
// --- FIN DE LA MODIFICACIÓN (Módulo 2.3) ---

// --- LÓGICA DEL BOT DE TELEGRAM ---
const WELCOME_MESSAGE = `
🤖✨ ¡Bienvenido a AI Brok Trade Pro! ✨🤖
Descubre una nueva era de trading inteligente. Nuestro sistema avanzado te permite generar ganancias de forma consistente y segura.
📈 **Modelo de Ganancias:**
Invierte y observa cómo tu capital crece con nuestros paquetes de trading automatizado.
💰 **Paquetes de Inversión:**
*   **Paquete Básico:** Invierte 3 USDT → Gana 1.5 USDT diarios
*   **Paquete Avanzado:** Invierte 8 USDT → Gana 4 USDT diarios
*   **Paquete Profesional:** Invierte 16 USDT → Gana 8 USDT diarios
*   ... ¡y muchos más!
🔒 **Seguridad y Transparencia:**
Todas las operaciones están respaldadas por tecnología blockchain, garantizando la seguridad de tus fondos.
¡Únete a la comunidad de AI Brok Trade Pro y empieza a construir tu futuro financiero hoy!
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

// --- INICIALIZACIÓN DE SERVICIOS DE LARGA DURACIÓN Y SERVIDOR ---
const server = http.createServer(app);
initializePriceService(server);
startMonitoring();
scheduleProfitDistribution();

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
        console.log(`🚀 Servidor de desarrollo y WebSocket corriendo en http://localhost:${PORT}`.yellow.bold);
    });
}

// --- MIDDLEWARE DE ERRORES (deben ir al final) ---
app.use(notFound);
app.use(errorHandler);

// --- EXPORTACIÓN PARA VERCEL ---
module.exports = server;

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