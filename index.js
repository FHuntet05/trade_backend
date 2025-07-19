// backend/index.js (CÓDIGO FINAL DE PRODUCCIÓN)
const express = require('express');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf');
const morgan = require('morgan');
const crypto = require('crypto');
const dotenv = require('dotenv');
const colors = require('colors');
const { startWatcher } = require('./services/blockchainWatcherService');

dotenv.config();
const connectDB = require('./config/db');

// Verificación de variables de entorno (se mantiene)
function checkEnvVariables() {
    console.log('[SISTEMA] Verificando variables de entorno críticas...');
    const requiredVars = ['MONGO_URI', 'JWT_SECRET', 'TELEGRAM_BOT_TOKEN', 'FRONTEND_URL', 'ADMIN_URL', 'BACKEND_URL', 'BSCSCAN_API_KEY', 'MASTER_SEED_PHRASE'];
    const missingVars = requiredVars.filter(v => !process.env[v]);
    if (missingVars.length > 0) {
        console.error(`!! ERROR FATAL: FALTAN VARIABLES DE ENTORNO: ${missingVars.join(', ')}`.red.bold);
        process.exit(1);
    }
    console.log('[SISTEMA] ✅ Todas las variables de entorno críticas están presentes.');
}
checkEnvVariables();
connectDB();

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

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

app.disable('etag');

// =======================================================================
// === CONFIGURACIÓN DE MIDDLEWARE (ORDEN CRÍTICO Y CORRECTO) ===
// =======================================================================

// 1. CORS: Debe ser el primero para manejar las peticiones pre-vuelo (OPTIONS)
// y permitir que el navegador continúe con la petición principal.
const whitelist = [process.env.FRONTEND_URL, process.env.ADMIN_URL];
console.log(`[CORS] Orígenes permitidos: [${whitelist.join(', ')}]`);
const corsOptions = {
    origin: whitelist,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
};
app.use(cors(corsOptions));

// 2. BODY PARSER: Debe ir después de CORS y antes de las rutas.
// Parsea el JSON del body de las peticiones (ej. POST, PUT) y lo pone en `req.body`.
// SIN ESTO, `req.body` EN TUS CONTROLADORES SERÁ `undefined`.
app.use(express.json());

// 3. LOGGER: Después de los parsers para que pueda loguear la información de la petición.
app.use(morgan('dev'));

// =======================================================================

// 4. RUTAS: Van al final, después de que todos los middlewares de preparación se hayan ejecutado.
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

const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET || crypto.randomBytes(32).toString('hex');
const secretPath = `/api/telegram-webhook/${secretToken}`;
app.post(secretPath, (req, res) => bot.handleUpdate(req.body, res));

// Lógica del bot (Pasarela) se mantiene sin cambios.
const WELCOME_MESSAGE = `
👋 ¡Bienvenido a NEURO LINK!\n\n
🔐 Tu acceso privilegiado al universo de la minería digital avanzada. Aquí, cada acción te acerca a recompensas exclusivas en NTX.\n\n
📘 ¿Cómo funciona?\n
1️⃣ Activa tu Minería: ⛏️ Inicia tu sesión cada 24 horas para comenzar a generar NTX, el token neural del ecosistema.\n
2️⃣ Optimiza tu Potencia: ⚙️ Accede a la tienda y adquiere herramientas con USDT, TRX o BNB. Aumenta tu velocidad de minería y maximiza tus beneficios.\n
3️⃣ Expande tu Red: 🧠 Invita a tus aliados con tu enlace personal. Obtén recompensas por su actividad y construye un flujo de ingresos pasivo.\n
4️⃣ Reclama y Evoluciona: 💎 Recupera tus NTX minados y fortalece tu saldo para futuras estrategias.\n\n
✨ Estás listo para comenzar tu travesía. Pulsa el botón inferior y desata el poder de la minería inteligente 🚀
`;

bot.command('start', async (ctx) => {
    try {
        const startPayload = ctx.startPayload ? ctx.startPayload.trim() : '';
        const baseWebAppUrl = process.env.FRONTEND_URL;
        let finalWebAppUrl = baseWebAppUrl;
        if (startPayload) {
            finalWebAppUrl = `${baseWebAppUrl}?startapp=${startPayload}`;
        }
        await ctx.replyWithPhoto('https://i.postimg.cc/pVFs2JYx/NEURO-LINK.jpg', {
            caption: WELCOME_MESSAGE,
            reply_markup: {
                inline_keyboard: [[Markup.button.webApp('🚀 Abrir App', finalWebAppUrl)]],
            }
        });
        await ctx.reply("...", { reply_markup: { remove_keyboard: true } }).then(result => ctx.deleteMessage(result.message_id));
    } catch (error) {
        console.error('[Bot Start] Error:', error);
    }
});
bot.telegram.setMyCommands([{ command: 'start', description: 'Inicia la aplicación' }]);

// 5. MANEJADORES DE ERRORES: Siempre al final de todo.
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, async () => {
    console.log(`[SERVIDOR] 🚀 Servidor corriendo en puerto ${PORT}`.yellow.bold);
    startWatcher(); 
    try {
        const botInfo = await bot.telegram.getMe();
        console.log(`[SERVIDOR] ✅ Conectado como bot: ${botInfo.username}.`);
        const webhookUrl = `${process.env.BACKEND_URL}${secretPath}`;
        await bot.telegram.setWebhook(webhookUrl, { secret_token: secretToken, drop_pending_updates: true });
        console.log(`[SERVIDOR] ✅ Webhook configurado en: ${webhookUrl}`.green.bold);
    } catch (e) {
        console.error("[SERVIDOR] ❌ ERROR AL CONFIGURAR TELEGRAM:", e.message);
    }
});

process.on('unhandledRejection', (err, promise) => {
    console.error(`❌ ERROR NO MANEJADO: ${err.message}`.red.bold);
    server.close(() => process.exit(1));
});