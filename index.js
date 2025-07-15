// backend/index.js (VERSIÓN FINAL, ESTABLE Y A PRUEBA DE FALLOS v14.0)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf');
const morgan = require('morgan');
require('dotenv').config();

// --- Validación de Variables de Entorno Críticas ---
const requiredEnvVars = ['MONGO_URI', 'TELEGRAM_BOT_TOKEN', 'JWT_SECRET', 'FRONTEND_URL', 'BACKEND_URL', 'ADMIN_URL'];
for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
        console.error(`ERROR FATAL: La variable de entorno requerida "${varName}" no está definida.`);
        process.exit(1);
    }
}

// --- Carga de Modelos y Servicios ---
require('./models/userModel'); require('./models/toolModel'); require('./models/transactionModel'); require('./models/settingsModel'); require('./models/cryptoWalletModel');
const PendingReferral = require('./models/pendingReferralModel');
const { startMonitoring } = require('./services/transactionMonitor');
const { startPriceService } = require('./services/priceService');

// --- Importación de Rutas ---
const authRoutes = require('./routes/authRoutes'); const toolRoutes = require('./routes/toolRoutes'); const rankingRoutes = require('./routes/rankingRoutes'); const walletRoutes = require('./routes/walletRoutes'); const teamRoutes = require('./routes/teamRoutes'); const taskRoutes = require('./routes/taskRoutes'); const paymentRoutes = require('./routes/paymentRoutes'); const adminRoutes = require('./routes/adminRoutes'); const treasuryRoutes = require('./routes/treasuryRoutes');

// --- Importación de Middlewares de Error ---
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// --- Inicialización de App y Bot ---
const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// --- Configuración de Middlewares ---
const whitelist = [process.env.FRONTEND_URL, process.env.ADMIN_URL];
const corsOptions = { origin: (origin, callback) => { if (!origin || whitelist.includes(origin)) { callback(null, true); } else { callback(new Error('Origen no permitido por CORS.')); } }, methods: "GET,HEAD,PUT,PATCH,POST,DELETE", credentials: true, allowedHeaders: "Origin, X-Requested-With, Content-Type, Accept, Authorization" };
app.options('*', cors(corsOptions)); 
app.use(cors(corsOptions));
app.use(express.json());
app.use(morgan('dev'));

// --- Definición de Rutas de la API ---
const secretPath = `/api/telegram-webhook/${bot.secretPathComponent()}`;
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', time: new Date() }));
app.use('/api/auth', authRoutes); app.use('/api/tools', toolRoutes); app.use('/api/ranking', rankingRoutes); app.use('/api/wallet', walletRoutes); app.use('/api/team', teamRoutes); app.use('/api/tasks', taskRoutes); app.use('/api/payment', paymentRoutes); app.use('/api/admin', adminRoutes); app.use('/api/treasury', treasuryRoutes);
app.post(secretPath, (req, res) => bot.handleUpdate(req.body, res));

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

// --- Middlewares de Error Finales ---
app.use(notFound); app.use(errorHandler);

// --- Función de Arranque del Servidor ---
async function startServer() {
    try {
        console.log('Conectando a MongoDB...');
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
                await bot.telegram.setWebhook(webhookUrl, { drop_pending_updates: true });
                console.log(`✅ Webhook configurado.`);
            } catch (e) { console.error("ERROR CRÍTICO AL CONFIGURAR TELEGRAM:", e.message); }
        });
    } catch (e) { console.error("ERROR FATAL DURANTE EL ARRANQUE:", e.message); process.exit(1); }
}
startServer();