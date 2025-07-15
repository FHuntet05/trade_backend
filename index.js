// backend/index.js (VERSIÓN FINAL, ESTABLE Y A PRUEBA DE FALLOS v14.0)

// -----------------------------------------------------------------------------
// 1. IMPORTACIONES
// -----------------------------------------------------------------------------
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf');
const morgan = require('morgan');
require('dotenv').config();

// --- Carga preventiva de modelos de Mongoose ---
require('./models/userModel');
require('./models/toolModel');
require('./models/transactionModel');
require('./models/settingsModel');
require('./models/cryptoWalletModel');
const PendingReferral = require('./models/pendingReferralModel');

// --- Importación de Servicios ---
const { startMonitoring } = require('./services/transactionMonitor');
const { startPriceService } = require('./services/priceService');

// --- Importación de Rutas (Ahora sabemos que son seguras) ---
const authRoutes = require('./routes/authRoutes');
const toolRoutes = require('./routes/toolRoutes');
const rankingRoutes = require('./routes/rankingRoutes');
const walletRoutes = require('./routes/walletRoutes');
const teamRoutes = require('./routes/teamRoutes');
const taskRoutes = require('./routes/taskRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const treasuryRoutes = require('./routes/treasuryRoutes');

// --- Importación de Middlewares de Manejo de Errores ---
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// -----------------------------------------------------------------------------
// 2. INICIALIZACIÓN Y CONFIGURACIÓN
// -----------------------------------------------------------------------------
const app = express();

// --- ¡¡¡LA CORRECCIÓN MÁS IMPORTANTE!!! ---
// Detiene el servidor con un error claro si el token no existe.
if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error("ERROR FATAL: La variable de entorno TELEGRAM_BOT_TOKEN no está definida.");
    console.error("ACCIÓN: Vaya al Dashboard de Render > Environment y añada la variable TELEGRAM_BOT_TOKEN.");
    process.exit(1); // Detiene la ejecución inmediatamente.
}
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// --- Configuración de CORS Avanzada y Específica ---
const whitelist = [process.env.FRONTEND_URL, process.env.ADMIN_URL].filter(Boolean);
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || whitelist.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error(`El origen '${origin}' no está permitido por CORS.`));
        }
    },
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
    allowedHeaders: "Origin, X-Requested-With, Content-Type, Accept, Authorization"
};
app.options('*', cors(corsOptions)); 
app.use(cors(corsOptions));

app.use(express.json());
app.use(morgan('dev'));

// -----------------------------------------------------------------------------
// 3. DEFINICIÓN DE RUTAS DE LA API
// -----------------------------------------------------------------------------
const secretPath = `/api/telegram-webhook/${bot.secretPathComponent()}`;

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', time: new Date() });
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

app.post(secretPath, (req, res) => {
    bot.handleUpdate(req.body, res);
});

// -----------------------------------------------------------------------------
// 4. LÓGICA DEL BOT DE TELEGRAM (Simplificada para brevedad)
// ... (Toda tu lógica de bot.command('start', etc.) va aquí sin cambios) ...
const WELCOME_MESSAGE = `*Bienvenido a NEURO LINK* 🚀...`; // Tu mensaje
function escapeMarkdownV2(text) { /* Tu función */ return text; }
bot.command('start', async (ctx) => { /* Tu lógica de start */ });
bot.telegram.setMyCommands([ { command: 'start', description: 'Inicia o reinicia la aplicación' } ]);

// -----------------------------------------------------------------------------
// 5. MANEJO DE ERRORES GLOBALES
// -----------------------------------------------------------------------------
app.use(notFound);
app.use(errorHandler);

// -----------------------------------------------------------------------------
// 6. FUNCIÓN DE ARRANQUE DEL SERVIDOR
// -----------------------------------------------------------------------------
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function startServer() {
    try {
        console.log('Intentando conectar a MongoDB...');
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
                
                await sleep(2000); 
                
                await bot.telegram.setWebhook(webhookUrl, { drop_pending_updates: true });
                console.log(`✅ Webhook configurado exitosamente.`);

            } catch (telegramError) {
                console.error("ERROR CRÍTICO AL CONFIGURAR TELEGRAM:", telegramError.message);
                console.log("--> Verifique que el TELEGRAM_BOT_TOKEN es correcto y que la URL del backend es accesible públicamente.");
            }
        });
    } catch (error) {
        console.error("ERROR FATAL DURANTE EL ARRANQUE:", error.message);
        console.error(error);
        process.exit(1);
    }
}

startServer();