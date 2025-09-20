// RUTA: backend/services/notificationService.js (VERSIÓN "NEXUS - RICH CONTENT FIX")
const { Telegraf } = require('telegraf');

let bot;
if (process.env.TELEGRAM_BOT_TOKEN) {
    bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
}

/**
 * Envía un mensaje a un usuario de Telegram por su ID.
 * Ahora maneja correctamente imágenes y botones pre-formateados.
 * @param {string} telegramId - El ID de Telegram del usuario.
 * @param {string} message - El mensaje a enviar. Soporta formato HTML.
 * @param {object} [options] - Opciones adicionales.
 * @param {string} [options.photo] - URL de la imagen a enviar.
 * @param {object} [options.reply_markup] - Objeto de markup de Telegraf (ej. para botones).
 */
const sendTelegramMessage = async (telegramId, message, options = {}) => {
    if (!bot) {
        console.warn('Bot de Telegram no inicializado. Saltando notificación.');
        return;
    }

    try {
        // [NEXUS NOTIFICATION FIX] - Preparamos el objeto 'extra' con las opciones.
        // Es más limpio y robusto.
        const extra = { 
            parse_mode: 'HTML',
        };

        // Si el controlador nos envió un markup (botones), lo añadimos.
        if (options.reply_markup) {
            extra.reply_markup = options.reply_markup;
        }

        // [NEXUS NOTIFICATION FIX] - Comprobamos la propiedad correcta ('photo') y usamos el método adecuado.
        if (options.photo) {
            // Si hay una imagen, usamos sendPhoto y el mensaje se convierte en el 'caption'.
            await bot.telegram.sendPhoto(telegramId, options.photo, {
                caption: message,
                ...extra
            });
        } else {
            // Si no hay imagen, usamos sendMessage.
            await bot.telegram.sendMessage(telegramId, message, extra);
        }
        
        // console.log(`Mensaje enviado exitosamente a ${telegramId}`);
        return { success: true };
    } catch (error) {
        // El error de Telegram a menudo incluye 'description' con información útil.
        const errorMessage = error.response?.description || error.message;
        console.error(`Error al enviar mensaje de Telegram a ${telegramId}:`, errorMessage);
        return { success: false, error: errorMessage };
    }
};

module.exports = {
    sendTelegramMessage,
};