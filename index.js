// backend/index.js (COMPLETO CON ARRANQUE ASÍNCRONO SEGURO)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const { Telegraf } = require('telegraf');
const PendingReferral = require('./models/pendingReferralModel');

// Importar los servicios de segundo plano
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


// --- LÓGICA DE ARRANQUE ASÍNCRONO DEL SERVIDOR ---
async function startServer() {
    try {
        // 1. Conectar a MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB conectado exitosamente.');

        // 2. Esperar a que la primera carga de precios sea exitosa
        // startPriceService ahora devuelve una promesa que se resuelve a 'true' si tiene éxito.
        const pricesLoaded = await startPriceService();
        if (!pricesLoaded) {
            console.error("El servidor no se iniciará porque el servicio de precios falló en la carga inicial.");
            process.exit(1); // Detiene el proceso si los precios no se pueden cargar
        }
        
        // 3. Iniciar el resto de los servicios de segundo plano que no bloquean el arranque
        startMonitoring();

        // 4. Iniciar el bot de Telegram
        bot.launch(() => console.log('Bot de Telegram iniciado y escuchando...'));

        // 5. Iniciar el servidor Express SOLO si todo lo anterior tuvo éxito
        const PORT = process.env.PORT || 5000;
        app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));

    } catch (error) {
        console.error("Error fatal durante el arranque del servidor:", error);
        process.exit(1);
    }
}

// Ejecutar la función de arranque principal
startServer();