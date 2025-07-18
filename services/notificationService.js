// RUTA: backend/services/notificationService.js (POTENCIADO CON IMÁGENES Y BOTONES)
const { Telegraf, Markup } = require('telegraf');

let bot;
if (process.env.TELEGRAM_BOT_TOKEN) {
    bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
}

/**
 * Envía un mensaje a un usuario de Telegram por su ID.
 * @param {string} telegramId - El ID de Telegram del usuario.
 * @param {string} message - El mensaje a enviar. Soporta formato HTML.
 * @param {object} [options] - Opciones adicionales.
 * @param {string} [options.imageUrl] - URL de la imagen a enviar.
 * @param {Array<object>} [options.buttons] - Array de botones, ej: [{text: 'Click Me', url: 'https://...'}]
 */
const sendTelegramMessage = async (telegramId, message, options = {}) => {
    if (!bot) {
        console.warn('Bot de Telegram no inicializado. Saltando notificación.');
        return;
    }

    try {
        const extra = { parse_mode: 'HTML' };
        if (options.buttons && options.buttons.length > 0) {
            extra.reply_markup = Markup.inlineKeyboard(
                options.buttons.map(btn => Markup.button.url(btn.text, btn.url))
            ).reply_markup;
        }

        if (options.imageUrl) {
            await bot.telegram.sendPhoto(telegramId, options.imageUrl, {
                caption: message,
                ...extra
            });
        } else {
            await bot.telegram.sendMessage(telegramId, message, extra);
        }
        // console.log(`Mensaje enviado exitosamente a ${telegramId}`);
        return { success: true };
    } catch (error) {
        console.error(`Error al enviar mensaje de Telegram a ${telegramId}:`, error.message);
        return { success: false, error: error.message };
    }
};

module.exports = {
    sendTelegramMessage,
};