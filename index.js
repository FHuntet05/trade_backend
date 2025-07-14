// backend/index.js (COMPLETO Y FINAL)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const { Telegraf } = require('telegraf');
const PendingReferral = require('./models/pendingReferralModel');

// <<< Importar los servicios de segundo plano
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

// --- CONEXIÓN A MONGODB E INICIO DE SERVICIOS ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB conectado exitosamente.');
    // Iniciar todos los servicios de segundo plano después de conectar a la DB
    startPriceService();
    startMonitoring();
  })
  .catch(err => console.error('Error de conexión a MongoDB:', err));

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
    let referrerId = null;

    if (ctx.startPayload) {
      referrerId = ctx.startPayload.trim();
    } else {
      const parts = ctx.message.text.split(' ');
      if (parts.length > 1 && parts[1]) {
        referrerId = parts[1].trim();
      }
    }

    if (referrerId && referrerId !== newUserId) {
      console.log(`[Bot] Usuario ${newUserId} referido por ${referrerId}. Guardando pre-vinculación...`);
      await PendingReferral.updateOne(
        { newUserId: newUserId },
        { $set: { referrerId: referrerId, createdAt: new Date() } },
        { upsert: true }
      );
    }
    
    const webAppUrl = process.env.FRONTEND_URL;
    ctx.reply(
      '¡Bienvenido a NEURO LINK! Haz clic abajo para iniciar la aplicación y comenzar a minar.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Abrir App', web_app: { url: webAppUrl } }]
          ]
        }
      }
    );

  } catch (error) {
    console.error('[Bot] Error en el comando /start:', error);
    ctx.reply('Ha ocurrido un error. Por favor, intenta de nuevo más tarde.');
  }
});

bot.launch(() => {
    console.log('Bot de Telegram iniciado y escuchando...');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));