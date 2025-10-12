// RUTA: trade_backend/setWebhook.js

// Este script se ejecuta UNA SOLA VEZ desde tu computadora para decirle
// a Telegram a dónde debe enviar las actualizaciones del bot.

require('dotenv').config();
const { Telegraf } = require('telegraf');

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const backendUrl = process.env.BACKEND_URL; // La URL de tu despliegue en Vercel (Ej: https://mi-app.vercel.app)
const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!botToken || !backendUrl || !secretToken) {
    console.error('Error: Asegúrate de que TELEGRAM_BOT_TOKEN, BACKEND_URL y TELEGRAM_WEBHOOK_SECRET estén en tu archivo .env');
    process.exit(1);
}

const bot = new Telegraf(botToken);
const webhookUrl = `${backendUrl}/api/telegram-webhook/${secretToken}`;

async function setupWebhook() {
  try {
    const result = await bot.telegram.setWebhook(webhookUrl, {
      secret_token: secretToken,
      drop_pending_updates: true
    });
    console.log(`✅ ¡Webhook configurado exitosamente!`);
    console.log(`Telegram ahora enviará actualizaciones a: ${webhookUrl}`);
    console.log(`Respuesta de Telegram: ${result}`);
  } catch (error) {
    console.error('❌ Error al configurar el webhook:');
    console.error(error);
  }
}

setupWebhook();