// backend/services/notificationService.js
const { Telegraf } = require('telegraf');

// Solo inicializamos una instancia del bot si tenemos el token.
// Esto evita errores si el servicio se importa en un contexto sin el bot.
let bot;
if (process.env.TELEGRAM_BOT_TOKEN) {
    bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
}

/**
 * Envía un mensaje a un usuario de Telegram por su ID.
 * @param {string} telegramId - El ID de Telegram del usuario.
 * @param {string} message - El mensaje a enviar. Soporta formato HTML de Telegraf.
 */
const sendTelegramMessage = async (telegramId, message) => {
    if (!bot) {
        console.warn('Bot de Telegram no inicializado. Saltando notificación.');
        return;
    }
    try {
        await bot.telegram.sendMessage(telegramId, message, { parse_mode: 'HTML' });
        console.log(`Mensaje enviado exitosamente a ${telegramId}`);
    } catch (error) {
        console.error(`Error al enviar mensaje de Telegram a ${telegramId}:`, error.message);
        // Posibles errores: el usuario bloqueó el bot, ID inválido, etc.
    }
};

module.exports = {
    sendTelegramMessage,
};