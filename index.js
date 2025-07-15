// backend/index.js (VERSIÓN DE DIAGNÓSTICO DE TELEGRAM)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');

// --- SIMPLIFICAMOS: No cargaremos otros servicios por ahora ---
// const { startMonitoring } = require('./services/transactionMonitor'); 
// const { startPriceService } = require('./services/priceService');

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

app.use(cors());
app.use(express.json());

// ... (las rutas de la API permanecen igual)
app.use('/api/auth', require('./routes/authRoutes'));
// ... etc.

const secretPath = `/api/telegram-webhook/${bot.secretPathComponent()}`;
app.post(secretPath, (req, res) => {
    bot.handleUpdate(req.body, res);
});

// --- COMANDO /START ULTRA-SIMPLIFICADO ---
bot.command('start', async (ctx) => {
    // ESTE LOG ES LA PRUEBA MÁS IMPORTANTE.
    console.log(`✅ [DIAGNÓSTICO] ¡Comando /start recibido del usuario ${ctx.from.id}! El Webhook funciona.`);
    
    try {
        // Enviamos un mensaje de texto simple, sin formato, para evitar errores de parseo.
        await ctx.reply(
            '¡El bot está respondiendo! La conexión con Telegram es exitosa.',
            Markup.inlineKeyboard([
              [Markup.button.webApp('🚀 Abrir App', process.env.FRONTEND_URL)]
            ])
        );
    } catch (error) {
        console.error('[Bot] Error al responder al comando /start:', error.message);
    }
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function startServer() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Conexión a MongoDB exitosa.');

        const PORT = process.env.PORT || 5000;
        app.listen(PORT, async () => {
            console.log(`🚀 Servidor Express corriendo en el puerto ${PORT}`);

            try {
                console.log('⏳ Esperando 12 segundos para máxima estabilización...');
                await sleep(12000); // Aumentamos a 12 segundos.

                console.log('🔧 [DIAGNÓSTICO] Verificando token del bot...');
                const botInfo = await bot.telegram.getMe();
                console.log(`✅ [DIAGNÓSTICO] Conectado como bot: ${botInfo.username}. El token es VÁLIDO.`);

                console.log('🔧 Limpiando configuración de webhook anterior...');
                await bot.telegram.deleteWebhook({ drop_pending_updates: true });

                const webhookUrl = `${process.env.BACKEND_URL}${secretPath}`;
                console.log('🔧 Intentando registrar el nuevo webhook en la URL:', webhookUrl);
                await bot.telegram.setWebhook(webhookUrl);

                console.log(`✅ Webhook de Telegram configurado.`);
            } catch (webhookError) {
                console.error("‼️ ERROR CRÍTICO AL CONFIGURAR TELEGRAM:", webhookError.message);
                if (webhookError.message.includes('token')) {
                    console.error("-> ¡SOSPECHA! El error contiene la palabra 'token'. Revisa la variable TELEGRAM_BOT_TOKEN en Render.");
                }
            }
        });

    } catch (error) {
        console.error("‼️ ERROR FATAL DURANTE EL ARRANQUE:", error.message);
        process.exit(1);
    }
}

startServer();