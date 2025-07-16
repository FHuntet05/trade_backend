// backend/index.js (VERSIÓN CORREGIDA v15.0)

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf'); // <-- CORRECCIÓN: Se añade 'Markup' a la importación.
const morgan = require('morgan');
const crypto = require('crypto');

console.log('[SISTEMA] Cargando variables de entorno...');
require('dotenv').config();

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

console.log('[SISTEMA] Cargando módulos internos...');
// NOTA: Se asume que PendingReferral está en userModel. Si no, habría que importarlo.
const User = require('./models/userModel'); 
const authRoutes = require('./routes/authRoutes');
const toolRoutes = require('./routes/toolRoutes');
const rankingRoutes = require('./routes/rankingRoutes');
const walletRoutes = require('./routes/walletRoutes');
const teamRoutes = require('./routes/teamRoutes');
const taskRoutes = require('./routes/taskRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const treasuryRoutes = require('./routes/treasuryRoutes');
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
app.use(morgan('dev'));

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
app.post(secretPath, (req, res) => bot.handleUpdate(req.body, res));
console.log('[SISTEMA] Rutas de API registradas.');

// --- Lógica del Bot de Telegram ---
const WELCOME_MESSAGE = `*Bienvenido a NEURO LINK* 🚀\n\n¡Estás a punto de entrar a un nuevo ecosistema de minería digital!\n\nHaz clic en el botón de abajo para lanzar la aplicación.`;
const escapeMarkdownV2 = (text) => text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
bot.command('start', async (ctx) => {
    try {
        const telegramId = ctx.from.id.toString();
        const startPayload = ctx.startPayload ? ctx.startPayload.trim() : null;
        
        if (startPayload) {
            // Lógica para manejar el referenciador. 
            // Se asume que se registrará el usuario cuando abra la Web App.
            // Aquí podríamos guardar una relación temporal si fuera necesario, 
            // pero la lógica de registro de usuario se maneja en el backend de la app.
            console.log(`[Bot] Usuario ${telegramId} ha llegado con el payload de referido: ${startPayload}`);
        }

        // Ahora 'Markup' está definido y la llamada funcionará correctamente.
        await ctx.replyWithMarkdownV2(escapeMarkdownV2(WELCOME_MESSAGE), Markup.inlineKeyboard([
            Markup.button.webApp('🚀 Abrir App', `${process.env.FRONTEND_URL}?ref=${startPayload || ''}`)
        ]));

    } catch (error) { 
        console.error('[Bot] Error en /start:', error.message, error); 
        // Enviar un mensaje de fallback al usuario si es posible
        await ctx.reply('Ocurrió un error al procesar tu solicitud. Por favor, intenta de nuevo más tarde.').catch(e => console.error('[Bot] Error al enviar mensaje de fallback:', e.message));
    }
});
bot.telegram.setMyCommands([{ command: 'start', description: 'Inicia la aplicación' }]);

app.use(notFound);
app.use(errorHandler);

async function startServer() {
    try {
        console.log('[SERVIDOR] Conectando a MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('[SERVIDOR] ✅ MongoDB conectado.');
        
        const PORT = process.env.PORT || 5000;
        app.listen(PORT, async () => {
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
    } catch (error) {
        console.error("[SERVIDOR] ‼️ ERROR FATAL:", error.message, error);
        process.exit(1);
    }
}

console.log('[SISTEMA] Iniciando servidor...');
startServer();