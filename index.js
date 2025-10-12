// RUTA: trade_backend/index.js (VERSIÓN "NEXUS - VERCEL RESTORED & REBRANDED")

// --- IMPORTS Y CONFIGURACIÓN INICIAL ---
const express = require('express');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf');
const morgan = require('morgan');
const crypto = require('crypto');
const dotenv = require('dotenv');
const colors = require('colors');
const connectDB = require('./config/db');
const User = require('./models/userModel');
const Tool = require('./models/toolModel');
const { startMonitoring } = require('./services/transactionMonitor.js');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

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
    const missingVars = requiredVars.filter(v => !process.env[v]);
    if (missingVars.length > 0) {
        console.error(`!! ERROR FATAL: FALTAN VARIABLES DE ENTORNO: ${missingVars.join(', ')}`.red.bold);
        throw new Error(`Variables de entorno faltantes: ${missingVars.join(', ')}`);
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
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// --- CONFIGURACIÓN DE EXPRESS ---
const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// --- RESTAURACIÓN DE MIDDLEWARES ORIGINALES ---
app.set('trust proxy', 1); // Confía en los encabezados de proxy (importante para Vercel/Render)

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true })); // Middleware de CORS
app.use(express.json()); // Middleware para parsear JSON
app.use(helmet()); // Middleware de seguridad
app.use(morgan('dev')); // Logger de peticiones HTTP

// Middleware de log personalizado
app.use((req, res, next) => {
    console.log(`[REQUEST LOG] Origen: ${req.headers.origin} | Método: ${req.method} | URL: ${req.url}`.magenta);
    next();
});

// Middleware de Rate Limiting (excluyendo el webhook de Telegram)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 200, // Límite de 200 peticiones por IP por ventana
    standardHeaders: true,
    legacyHeaders: false,
});
app.use((req, res, next) => {
    // Excluimos la ruta del webhook del rate limiter para no bloquear a Telegram
    if (req.path.startsWith('/api/telegram-webhook')) {
        return next();
    }
    limiter(req, res, next);
});

// --- REGISTRO DE RUTAS DE LA API ---
app.get('/', (req, res) => res.json({ message: 'API de AI Brok Trade Pro funcionando en Vercel' }));
app.get('/health', async (req, res) => {
    try {
        // Verificar la conexión con Telegram
        const botInfo = await bot.telegram.getMe();
        // Verificar la conexión con MongoDB
        const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
        
        res.status(200).json({ 
            status: 'ok',
            bot: {
                username: botInfo.username,
                id: botInfo.id,
                status: 'connected'
            },
            database: dbStatus,
            webhook: {
                path: secretPath,
                url: `${process.env.BACKEND_URL}${secretPath}`
            }
        });
    } catch (error) {
        console.error('[Health Check] Error:', error);
        res.status(500).json({ 
            status: 'error',
            error: error.message
        });
    }
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
app.use('/api/users', userRoutes);

// --- LÓGICA DEL BOT DE TELEGRAM Y MENSAJE ACTUALIZADO ---
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
        console.log('[Bot /start] Iniciando comando start para usuario:', ctx.from.id);
        
        const referredId = ctx.from.id.toString();
        let referrerId = ctx.startPayload ? ctx.startPayload.trim() : (ctx.message.text.split(' ')[1] || null);
        
        console.log('[Bot /start] Buscando usuario existente...');
        let referredUser = await User.findOne({ telegramId: referredId });
        
        if (!referredUser) {
            console.log('[Bot /start] Usuario no encontrado, creando nuevo usuario...');
            const username = ctx.from.username || `user_${referredId}`;
            const fullName = `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim();
            referredUser = new User({ 
                telegramId: referredId, 
                username, 
                fullName: fullName || username, 
                language: ctx.from.language_code || 'es' 
            });
        }

        if (referrerId) {
            console.log('[Bot /start] Procesando referido:', referrerId);
            const canBeReferred = referrerId !== referredId && !referredUser.referredBy;
            if (canBeReferred) {
                const referrerUser = await User.findOne({ telegramId: referrerId });
                if (referrerUser) {
                    console.log('[Bot /start] Vinculando usuario referido con referente...');
                    referredUser.referredBy = referrerUser._id;
                    if (!referrerUser.referrals.some(ref => ref.user.equals(referredUser._id))) {
                        referrerUser.referrals.push({ level: 1, user: referredUser._id });
                        await referrerUser.save();
                    }
                }
            }
        }
        
        console.log('[Bot /start] Guardando usuario...');
        await referredUser.save();
        
        const imageUrl = 'https://i.postimg.cc/XqqqFR0C/photo-2025-09-20-02-42-29.jpg';
        const webAppUrl = process.env.CLIENT_URL;
        
        console.log('[Bot /start] Enviando mensaje de bienvenida...');
        await ctx.replyWithPhoto(imageUrl, {
            caption: WELCOME_MESSAGE,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [ Markup.button.webApp('🚀 Abrir App', webAppUrl) ]
                ]
            }
        });
        
        console.log('[Bot /start] Comando start completado exitosamente');
    } catch (error) {
        console.error('[Bot /start] ERROR FATAL EN EL COMANDO START:'.red.bold, error);
        // Intentar enviar un mensaje de error al usuario
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
app.post(secretPath, async (req, res) => {
    try {
        console.log('[Webhook] Recibida actualización de Telegram');
        await bot.handleUpdate(req.body, res);
        console.log('[Webhook] Actualización procesada exitosamente');
    } catch (error) {
        console.error('[Webhook] Error al procesar actualización:', error);
        res.status(500).json({ error: 'Error al procesar la actualización del bot' });
    }
});

// --- ADVERTENCIA SOBRE MONITOREO DE TRANSACCIONES EN VERCEL ---
// La función `startMonitoring` utiliza `setInterval`, que no es fiable para tareas en segundo plano
// en un entorno serverless como Vercel. La forma correcta de implementar esto en Vercel
// es utilizando "Cron Jobs". Por ahora, esta función se ejecutará solo cuando una
// función serverless esté activa, lo cual no es ideal para un monitoreo constante.
startMonitoring();

// --- MIDDLEWARE DE ERRORES (deben ir al final) ---
app.use(notFound);
app.use(errorHandler);

// --- EXPORTACIÓN PARA VERCEL ---
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