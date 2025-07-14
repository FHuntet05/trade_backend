// backend/index.js (VERSIÓN FINAL CON ARRANQUE 100% ROBUSTO)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const { Telegraf } = require('telegraf');
const PendingReferral = require('./models/pendingReferralModel');

const { startMonitoring } = require('./services/transactionMonitor'); 
const { startPriceService } = require('./services/priceService');

const app = express();

// --- CONFIGURACIÓN DE CORS ---
const whitelist = [
    'https://linker-frontend.onrender.com',
    'http://localhost:5173'
];
const corsOptions = {
    origin: function (origin, callback) {
        if (whitelist.indexOf(origin) !== -1 || !origin) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
};
app.use(cors(corsOptions));
app.use(express.json());

// --- RUTAS DE LA API ---
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/tools', require('./routes/toolRoutes'));
app.use('/api/ranking', require('./routes/rankingRoutes'));
app.use('/api/wallet', require('./routes/walletRoutes'));
app.use('/api/team', require('./routes/teamRoutes'));
app.use('/api/tasks', require('./routes/taskRoutes'));
app.use('/api/payment', require('./routes/paymentRoutes'));

// --- LÓGICA DEL BOT DE TELEGRAF ---
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
bot.command('start', async (ctx) => {
  try {
    const newUserId = ctx.from.id.toString();
    let referrerId = ctx.startPayload ? ctx.startPayload.trim() : (ctx.message.text.split(' ')[1] || null);

    if (referrerId && referrerId !== newUserId) {
      await PendingReferral.updateOne(
        { newUserId: newUserId },
        { $set: { referrerId: referrerId, createdAt: new Date() } },
        { upsert: true }
      );
    }
    
    const webAppUrl = process.env.FRONTEND_URL;
    ctx.reply(
      '¡Bienvenido a NEURO LINK! Haz clic abajo para iniciar la aplicación.',
      {
        reply_markup: {
          inline_keyboard: [[{ text: '🚀 Abrir App', web_app: { url: webAppUrl } }]]
        }
      }
    );
  } catch (error) {
    console.error('[Bot] Error en el comando /start:', error);
  }
});

// --- LÓGICA DE ARRANQUE ASÍNCRONO DEL SERVIDOR ---
async function startServer() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB conectado exitosamente.');

        const pricesLoaded = await startPriceService();
        // <<< CORRECCIÓN CRÍTICA >>>
        // Si startPriceService devuelve 'false' (después de todos los reintentos),
        // lanzamos un error para que sea capturado por el bloque catch y se detenga el proceso.
        if (!pricesLoaded) {
            throw new Error("El servicio de precios falló en la carga inicial.");
        }
        
        startMonitoring();

        // Telegraf tiene su propio manejo de errores, no necesita estar en el try/catch principal.
        bot.launch(() => console.log('Bot de Telegram iniciado y escuchando...'));

        const PORT = process.env.PORT || 5000;
        app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));

    } catch (error) {
        console.error("!!! ERROR FATAL DURANTE EL ARRANQUE DEL SERVIDOR:", error.message);
        // Ahora, cualquier fallo en el bloque try detendrá el servidor de forma segura.
        process.exit(1);
    }
}

// Ejecutar la función de arranque principal
startServer();