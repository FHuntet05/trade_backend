// backend/index.js (VERSIÓN DE DEPURACIÓN PARA AISLAR LA RUTA DEFECTUOSA)

// -----------------------------------------------------------------------------
// 1. IMPORTACIONES
// -----------------------------------------------------------------------------
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf');
const morgan = require('morgan');
require('dotenv').config();
require('colors');

// --- Carga preventiva de modelos de Mongoose ---
require('./models/userModel');


// --- Importación de Servicios ---
// const { startMonitoring } = require('./services/transactionMonitor');
// const { startPriceService } = require('./services/priceService');

// --- Importación de Rutas (TEMPORALMENTE DESHABILITADAS) ---
 const authRoutes = require('./routes/authRoutes');
// const toolRoutes = require('./routes/toolRoutes');
// const rankingRoutes = require('./routes/rankingRoutes');
// const walletRoutes = require('./routes/walletRoutes');
// const teamRoutes = require('./routes/teamRoutes');
// const taskRoutes = require('./routes/taskRoutes');
// const paymentRoutes = require('./routes/paymentRoutes');
// const adminRoutes = require('./routes/adminRoutes');
// const treasuryRoutes = require('./routes/treasuryRoutes');

// --- Importación de Middlewares de Manejo de Errores ---
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// -----------------------------------------------------------------------------
// 2. INICIALIZACIÓN Y CONFIGURACIÓN
// -----------------------------------------------------------------------------
const app = express();

if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error("‼️ ERROR FATAL: La variable de entorno TELEGRAM_BOT_TOKEN no está definida.".red.bold);
    process.exit(1);
}
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// --- Configuración de CORS ---
const whitelist = [process.env.FRONTEND_URL, process.env.ADMIN_URL].filter(Boolean);
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || whitelist.indexOf(origin) !== -1) { callback(null, true); } 
        else { callback(new Error(`Origen '${origin}' no permitido.`)); }
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
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// --- Uso de Rutas (TEMPORALMENTE DESHABILITADAS) ---
 app.use('/api/auth', authRoutes);
// app.use('/api/tools', toolRoutes);
// app.use('/api/ranking', rankingRoutes);
// app.use('/api/wallet', walletRoutes);
// app.use('/api/team', teamRoutes);
// app.use('/api/tasks', taskRoutes);
// app.use('/api/payment', paymentRoutes);
// app.use('/api/admin', adminRoutes);
// app.use('/api/treasury', treasuryRoutes);

app.post(secretPath, (req, res) => bot.handleUpdate(req.body, res));

// -----------------------------------------------------------------------------
// 5. MANEJO DE ERRORES GLOBALES
// -----------------------------------------------------------------------------
app.use(notFound);
app.use(errorHandler);

// -----------------------------------------------------------------------------
// 6. FUNCIÓN DE ARRANQUE DEL SERVIDOR
// -----------------------------------------------------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor de DEPURACIÓN corriendo en el puerto ${PORT}`.cyan.bold);
    console.log('Todas las rutas de la API están deshabilitadas.'.yellow);
    console.log('Proceda a habilitarlas una por una para encontrar el error.'.yellow);
});