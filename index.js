// backend/index.js (VERSIÓN CORREGIDA Y OPTIMIZADA PARA VERCEL)

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
const { body, validationResult } = require('express-validator');

console.log('[SISTEMA] Iniciando aplicación BLOCKSPHERE...');
dotenv.config();
console.log(`[DEBUG] Leyendo TELEGRAM_WEBHOOK_SECRET: ${process.env.TELEGRAM_WEBHOOK_SECRET ? '✅ Encontrada' : '❌ NO ENCONTRADA / UNDEFINED'}`);
function checkEnvVariables() {
    console.log('[SISTEMA] Verificando variables de entorno críticas...');
    const requiredVars = [
        'MONGO_URI', 'JWT_SECRET', 'JWT_ADMIN_SECRET', 'TELEGRAM_BOT_TOKEN', 
        'CLIENT_URL', 'BACKEND_URL', 'ANKR_RPC_URL', 'GAS_DISPENSER_PRIVATE_KEY',
        'TREASURY_WALLET_ADDRESS', 'SUPER_ADMIN_TELEGRAM_ID', 'MASTER_SEED_PHRASE'
    ];
    const missingVars = requiredVars.filter(v => !process.env[v]);
    if (missingVars.length > 0) {
        // En un entorno serverless, esto detendrá la ejecución de la función.
        console.error(`!! ERROR FATAL: FALTAN VARIABLES DE ENTORNO: ${missingVars.join(', ')}`.red.bold);
        throw new Error(`Variables de entorno faltantes: ${missingVars.join(', ')}`);
    }
    console.log('[SISTEMA] ✅ Todas las variables de entorno críticas están presentes.');
}
checkEnvVariables();

// --- CONEXIÓN A BASE DE DATOS ---
connectDB();

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
            miningBoost: 500,
            durationDays: 5,
            imageUrl: "https://i.postimg.cc/pLgD5gYq/free-miner.png",
            isFree: true,
        });
        await newFreeTool.save();
        console.log('[SISTEMA] ✅ Herramienta gratuita creada y guardada en la base de datos.'.green.bold);
    } catch (error) {
        console.error('❌ ERROR FATAL al provisionar la herramienta gratuita:'.red.bold, error);
    }
};
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

// --- Configuración de CORS ---
const clientUrl = process.env.CLIENT_URL;
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || origin === clientUrl) {
            callback(null, true);
        } else {
            console.error(`[CORS] ❌ Origen RECHAZADO: '${origin}' no coincide con CLIENT_URL.`.red.bold);
            callback(new Error(`Origen no permitido por CORS: ${origin}`));
        }
    },
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
};
app.use(cors(corsOptions));

// --- Middlewares de JSON y Seguridad ---
app.use(express.json());

// --- REGISTRO DE RUTAS DE LA API ---
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/', (req, res) => {
  res.json({ message: 'API funcionando correctamente' });
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

// --- LÓGICA DEL BOT DE TELEGRAM ---
const WELCOME_MESSAGE = `
🌐🚀 NEW PROJECT: BlockSphere 🚀🌐\n\n  
📢 Official launch: September 22 2025 
✔️ PERMANENT project, fully backed by blockchain.
🔒 All funds are protected and managed with complete security.\n
💰 Guaranteed daily earnings:\n  
📦 Active investment/mining packages:
🔹 Package 1: 3 USDT → 1.5 USDT daily 
🔹 Package 2: 8 USDT → 4 USDT daily 
🔹 Package 3: 16 USDT → 8 USDT daily
🔹 Package 4: 32 USDT → 16 USDT daily
🔹 Package 5: 75 USDT → 37.5 USDT daily\n 
✨ This project is here to stay. 
📈 BlockSphere will provide steady earnings and grow permanently. 
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
        await ctx.reply('Lo sentimos, ha ocurrido un error al procesar tu solicitud.');
    }
});

// --- LÓGICA DEL WEBHOOK (CRÍTICO PARA VERCEL) ---

// **IMPORTANTE**: Debes crear una variable de entorno en Vercel llamada `TELEGRAM_WEBHOOK_SECRET`
// con un valor secreto y estático que tú generes.
const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!secretToken) {
    console.error('!! ERROR FATAL: La variable de entorno TELEGRAM_WEBHOOK_SECRET no está definida.'.red.bold);
    // Esto evita que el bot intente funcionar con un token inválido.
} else {
    // Definimos el path secreto para el webhook
    const secretPath = `/api/telegram-webhook/${secretToken}`;

    // Creamos el endpoint para que Telegram envíe las actualizaciones.
    // Vercel dirigirá las peticiones a '/api/telegram-webhook/...' a este manejador.
    app.post(secretPath, (req, res) => {
      // Verificamos que el token que envía Telegram coincida con el nuestro
      if (req.headers['x-telegram-bot-api-secret-token'] !== secretToken) {
        console.error('❌ Webhook rechazado: token secreto inválido'.red.bold);
        return res.status(401).send('Unauthorized');
      }
      bot.handleUpdate(req.body, res);
    });

    // Función asíncrona para configurar el webhook
    const setupWebhook = async () => {
        try {
            // **IMPORTANTE**: Asegúrate que la variable `BACKEND_URL` en Vercel sea la URL de tu despliegue.
            // Ejemplo: https://mi-proyecto.vercel.app
            const webhookUrl = `${process.env.BACKEND_URL}${secretPath}`;
            
            await bot.telegram.setWebhook(webhookUrl, {
                secret_token: secretToken,
                drop_pending_updates: true // Ignora actualizaciones viejas
            });
            console.log(`[SISTEMA] ✅ Webhook configurado en: ${webhookUrl}`.green.bold);

            const botInfo = await bot.telegram.getMe();
            console.log(`[SISTEMA] ✅ Conectado como bot: ${botInfo.username}.`.green);

        } catch (err) {
            console.error(`[SISTEMA] ❌ Error al configurar el webhook de Telegram: ${err.message}`.red.bold);
        }
    };
    
    // Llamamos a la configuración del webhook cuando la función se inicializa.
    setupWebhook();
}

// Inicia el monitoreo de transacciones (si aplica a un entorno serverless)
startMonitoring();

// --- MIDDLEWARE DE ERRORES (deben ir al final) ---
app.use(notFound);
app.use(errorHandler);


// --- EXPORTACIÓN PARA VERCEL (EL CAMBIO MÁS IMPORTANTE) ---
// En lugar de app.listen, exportamos la instancia de la app.
// Vercel se encargará de levantar el servidor y dirigirle las peticiones.
module.exports = app;