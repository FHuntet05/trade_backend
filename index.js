// backend/index.js (VERSIÓN FINAL CON WEBHOOKS)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const { Telegraf } = require('telegraf');
const PendingReferral = require('./models/pendingReferralModel');

const { startMonitoring } = require('./services/transactionMonitor'); 
const { startPriceService } = require('./services/priceService');

const app = express();
app.use(cors()); // Usamos cors simple para el webhook
app.use(express.json()); // Aseguramos que Express pueda parsear el JSON de Telegram

// --- CONFIGURACIÓN DE TELEGRAF ---
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const secretPath = `/api/telegram-webhook/${bot.secretPathComponent()}`;

// --- RUTAS DE LA API ---
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/tools', require('./routes/toolRoutes'));
// ... (resto de tus rutas) ...
app.use('/api/payment', require('./routes/paymentRoutes'));

// --- ENDPOINT DEL WEBHOOK ---
// Telegram enviará actualizaciones a esta ruta.
app.post(secretPath, (req, res) => {
    bot.handleUpdate(req.body, res);
});

// --- LÓGICA DEL BOT (COMANDOS, ETC.) ---
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
        if (!pricesLoaded) {
            throw new Error("El servicio de precios falló en la carga inicial.");
        }
        
        startMonitoring();

        // --- REGISTRAMOS EL WEBHOOK EN TELEGRAM ---
        // Le decimos a Telegram a dónde enviar las actualizaciones.
        const webhookUrl = `${process.env.BACKEND_URL}${secretPath}`;
        await bot.telegram.setWebhook(webhookUrl);
        console.log(`Webhook de Telegram configurado en: ${webhookUrl}`);

        const PORT = process.env.PORT || 5000;
        app.listen(PORT, () => {
            console.log(`Servidor corriendo en el puerto ${PORT}`);
            console.log("El bot ahora funciona en modo Webhook. No más errores 409.");
        });

    } catch (error) {
        console.error("!!! ERROR FATAL DURANTE EL ARRANQUE DEL SERVIDOR:", error.message);
        process.exit(1);
    }
}

// Ya NO usamos bot.launch(). Ejecutamos nuestro arranque seguro.
startServer();