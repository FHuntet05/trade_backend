// backend/index.js (VERSIÓN "NEXUS - AUTO PROVISIONING & REFERRAL FIX")

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
const Tool = require('./models/toolModel'); // [NEXUS PROVISIONING] Importamos el modelo de herramientas.
const { startMonitoring } = require('./services/transactionMonitor.js');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

console.log('[SISTEMA] Iniciando aplicación BLOCKSPHERE...');
dotenv.config();

function checkEnvVariables() {
    console.log('[SISTEMA] Verificando variables de entorno críticas...');
    const requiredVars = [
        'MONGO_URI', 'JWT_SECRET', 'JWT_ADMIN_SECRET', 'TELEGRAM_BOT_TOKEN', 
        'CLIENT_URL', 'BACKEND_URL', 'ANKR_RPC_URL', 'GAS_DISPENSER_PRIVATE_KEY',
        'TREASURY_WALLET_ADDRESS', 'SUPER_ADMIN_TELEGRAM_ID', 'MASTER_SEED_PHRASE'
    ];
    const missingVars = requiredVars.filter(v => !process.env[v]);
    if (missingVars.length > 0) {
        console.error(`!! ERROR FATAL: FALTAN VARIABLES DE ENTORNO: ${missingVars.join(', ')}`.red.bold);
        process.exit(1);
    }
    console.log('[SISTEMA] ✅ Todas las variables de entorno críticas están presentes.');
}
checkEnvVariables();

// --- CONEXIÓN A BASE DE DATOS ---
connectDB();

// [NEXUS PROVISIONING] - INICIO DE LA LÓGICA DE PROVISIÓN AUTOMÁTICA
const provisionFreeTool = async () => {
    try {
        const freeToolExists = await Tool.findOne({ isFree: true });
        if (freeToolExists) {
            console.log('[SISTEMA] ✅ Herramienta gratuita ya existe en la base de datos.'.green);
            return;
        }

        console.log('[SISTEMA] ⚠️ No se encontró herramienta gratuita. Creando una por defecto...'.yellow);
        const newFreeTool = new Tool({
            name: "Miner Gratuito de Inicio",
            vipLevel: 0,
            price: 0,
            miningBoost: 500, // 500 NTX por día
            durationDays: 5,   // Dura 5 días
            imageUrl: "https://i.postimg.cc/pLgD5gYq/free-miner.png", // URL de imagen genérica
            isFree: true,
        });
        await newFreeTool.save();
        console.log('[SISTEMA] ✅ Herramienta gratuita creada y guardada en la base de datos.'.green.bold);

    } catch (error) {
        console.error('❌ ERROR FATAL al provisionar la herramienta gratuita:'.red.bold, error);
        // En un entorno de producción, podría decidir si detener el servidor es necesario.
        // process.exit(1); 
    }
};
// Ejecutamos la provisión después de conectar a la BD.
provisionFreeTool();
// [NEXUS PROVISIONING] - FIN DE LA LÓGICA DE PROVISIÓN AUTOMÁTICA


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
app.use(express.json());

app.use((req, res, next) => {
    console.log(`[REQUEST LOG] Origen: ${req.headers.origin} | Método: ${req.method} | URL: ${req.url}`.magenta);
    next();
});

app.use(helmet());

// --- Configuración de CORS ---
const whitelist = [process.env.CLIENT_URL];
const corsOptions = {
    origin: (origin, callback) => {
        if (whitelist.includes(origin) || !origin) {
            callback(null, true);
        } else {
            console.error(`[CORS] ❌ Origen RECHAZADO: '${origin}' no está en la whitelist.`.red.bold);
            callback(new Error(`Origen no permitido por CORS: ${origin}`));
        }
    },
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
};

app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

// --- Rate Limiting ---
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Demasiadas peticiones desde esta IP, por favor intente de nuevo después de 15 minutos.'
});
app.use(globalLimiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Demasiados intentos de autenticación desde esta IP. Por seguridad, su acceso ha sido bloqueado temporalmente.'
});

// --- REGISTRO DE RUTAS DE LA API ---
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.use('/api/auth', authLimiter, authRoutes); 
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

📢 Official launch: September 22 2025 \n 
✔️ PERMANENT project, fully backed by blockchain.\n 
🔒 All funds are protected and managed with complete security.\n\n

💰 Guaranteed daily earnings:\n  
📦 Active investment/mining packages:\n
🔹 Package 1: 3 USDT → 1.5 USDT daily\n  
🔹 Package 2: 8 USDT → 4 USDT daily\n  
🔹 Package 3: 16 USDT → 8 USDT daily\n 
🔹 Package 4: 32 USDT → 16 USDT daily\n 
🔹 Package 5: 75 USDT → 37.5 USDT daily\n\n  

✨ This project is here to stay.\n  
📈 BlockSphere will provide steady earnings and grow permanently.\n 
🔥 A solid and transparent system that truly makes a difference in the market.`;


bot.command('start', async (ctx) => {
    try {
        const referredId = ctx.from.id.toString();
        let referrerId = null;
        if (ctx.startPayload) {
            referrerId = ctx.startPayload.trim();
        } else {
            const parts = ctx.message.text.split(' ');
            if (parts.length > 1 && parts[1]) {
                referrerId = parts[1].trim();
            }
        }
        
        console.log(`[Bot /start] Petición de inicio. Usuario: ${referredId}. Potencial Referente: ${referrerId}`.cyan);

        let referredUser = await User.findOne({ telegramId: referredId });
        if (!referredUser) {
            const username = ctx.from.username || `user_${referredId}`;
            const fullName = `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim();
            referredUser = new User({ telegramId: referredId, username, fullName: fullName || username, language: ctx.from.language_code || 'es' });
        }

        // [NEXUS REFERRAL FIX] - INICIO DE LA LÓGICA DE REFERIDOS CORREGIDA
        const canBeReferred = referrerId && referrerId !== referredId && !referredUser.referredBy;

        if (canBeReferred) {
            console.log(`[Bot /start] Intentando asignar referente ${referrerId} al nuevo usuario ${referredId}.`.yellow);
            const referrerUser = await User.findOne({ telegramId: referrerId });
            
            if (referrerUser) {
                referredUser.referredBy = referrerUser._id;
                console.log(`[Bot /start] Referente ${referrerUser.username} (${referrerId}) encontrado. Asignando...`.green);

                const isAlreadyReferred = referrerUser.referrals.some(ref => ref.user.equals(referredUser._id));
                if (!isAlreadyReferred) {
                    referrerUser.referrals.push({ level: 1, user: referredUser._id });
                    await referrerUser.save();
                    console.log(`[Bot /start] Nuevo usuario ${referredUser.username} añadido a la lista de referidos de ${referrerUser.username}.`.green.bold);
                } else {
                     console.log(`[Bot /start] El usuario ${referredUser.username} ya estaba en la lista de referidos de ${referrerUser.username}. No se realizan cambios.`.yellow);
                }
            } else {
                console.log(`[Bot /start] ADVERTENCIA: El ID de referente ${referrerId} no fue encontrado en la base de datos.`.red);
            }
        }
        // [NEXUS REFERRAL FIX] - FIN DE LA LÓGICA DE REFERIDOS CORREGIDA

        await referredUser.save();
        console.log(`[Bot /start] Perfil del usuario ${referredId} guardado/actualizado en la BD.`);
        
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
        await ctx.reply('Lo sentimos, ha ocurrido un error al procesar tu solicitud.');
    }
});

bot.telegram.setMyCommands([{ command: 'start', description: 'Inicia la aplicación' }]);
const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET || crypto.randomBytes(32).toString('hex');
const secretPath = `/api/telegram-webhook/${secretToken}`;
app.post(secretPath, (req, res) => bot.handleUpdate(req.body, res));

// --- MIDDLEWARE DE ERRORES Y ARRANQUE DEL SERVIDOR ---
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, async () => {
    console.log(`[SERVIDOR] 🚀 Servidor corriendo en puerto ${PORT}`.yellow.bold);
  
    startMonitoring();

    try {
        const botInfo = await bot.telegram.getMe();
        console.log(`[SERVIDOR] ✅ Conectado como bot: ${botInfo.username}.`);
        const webhookUrl = `${process.env.BACKEND_URL}${secretPath}`;
        await bot.telegram.setWebhook(webhookUrl, { secret_token: secretToken, drop_pending_updates: true });
        console.log(`[SERVIDOR] ✅ Webhook configurado en: ${webhookUrl}`.green.bold);
    } catch (telegramError) {
        console.error("[SERVIDOR] ❌ ERROR AL CONFIGURAR TELEGRAM:", telegramError.message.red);
    }
});

process.on('unhandledRejection', (err, promise) => {
    console.error(`❌ ERROR NO MANEJADO: ${err.message}`.red.bold, err);
    server.close(() => process.exit(1));
});