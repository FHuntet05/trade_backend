// backend/index.js (VERSIÓN FINAL, PACIENTE Y TOLERANTE A FALLOS)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const { Telegraf } = require('telegraf');
const PendingReferral = require('./models/pendingReferralModel');

// Importación de servicios y modelos
const { startMonitoring } = require('./services/transactionMonitor'); 
const { startPriceService } = require('./services/priceService');
const Price = require('./models/priceModel'); // Importamos el modelo para verificar precios antiguos

const app = express();

// --- CONFIGURACIÓN DE MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// --- CONFIGURACIÓN DE TELEGRAF PARA WEBHOOKS ---
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
// Generamos una ruta secreta y única para el webhook para añadir una capa de seguridad.
const secretPath = `/api/telegram-webhook/${bot.secretPathComponent()}`;


// --- REGISTRO DE TODAS LAS RUTAS DE LA API ---
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/tools', require('./routes/toolRoutes'));
app.use('/api/ranking', require('./routes/rankingRoutes'));
app.use('/api/wallet', require('./routes/walletRoutes'));
app.use('/api/team', require('./routes/teamRoutes'));
app.use('/api/tasks', require('./routes/taskRoutes'));
app.use('/api/payment', require('./routes/paymentRoutes'));


// --- ENDPOINT DEL WEBHOOK ---
// Aquí es donde Telegram enviará las actualizaciones del bot.
// El servidor "recibe" en lugar de "preguntar", eliminando los errores 409.
app.post(secretPath, (req, res) => {
    bot.handleUpdate(req.body, res);
});


// --- LÓGICA DE COMANDOS DEL BOT ---
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

// Función auxiliar para crear una pausa
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- FUNCIÓN PRINCIPAL DE ARRANQUE DEL SERVIDOR ---
async function startServer() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB conectado exitosamente.');

        // --- LÓGICA DE PRECIOS MEJORADA ---
        const pricesLoaded = await startPriceService();
        if (!pricesLoaded) {
            // Si la API de CoinGecko falla, revisamos si tenemos datos viejos en la DB como respaldo.
            const oldPricesCount = await Price.countDocuments();
            if (oldPricesCount < 3) { // Asumimos que necesitamos al menos BNB, TRX, USDT.
                // Si no hay datos de respaldo, el fallo es fatal.
                throw new Error("El servicio de precios falló y no hay datos de respaldo en la base de datos.");
            }
            // Si hay datos de respaldo, el servidor puede continuar, pero con una advertencia clara.
            console.warn("ADVERTENCIA: No se pudo contactar a CoinGecko. Usando precios antiguos de la base de datos.");
        }
        
        // Iniciamos el monitor de transacciones.
        startMonitoring();

        // Iniciamos el servidor Express para que empiece a escuchar peticiones.
        const PORT = process.env.PORT || 5000;
        app.listen(PORT, async () => {
            console.log(`Servidor corriendo en el puerto ${PORT}`);

            // --- LÓGICA DE REGISTRO DEL WEBHOOK MEJORADA ---
            try {
                // Esperamos 5 segundos antes de registrar el webhook.
                // Esto le da tiempo al DNS de Render a propagarse, evitando el error "Failed to resolve host".
                console.log("Esperando 5 segundos antes de configurar el webhook para la propagación del DNS...");
                await sleep(5000);

                const webhookUrl = `${process.env.BACKEND_URL}${secretPath}`;
                await bot.telegram.setWebhook(webhookUrl);
                console.log(`✅ Webhook de Telegram configurado exitosamente en: ${webhookUrl}`);
                console.log("El bot ahora funciona en modo Webhook. El sistema está 100% operativo.");
            } catch (webhookError) {
                // Si el registro del webhook falla, el servidor no se caerá.
                // Registrará un error crítico para que lo podamos investigar, pero la API seguirá funcionando.
                console.error("!!! ERROR CRÍTICO AL CONFIGURAR EL WEBHOOK:", webhookError.message);
            }
        });

    } catch (error) {
        console.error("!!! ERROR FATAL DURANTE EL ARRANQUE DEL SERVIDOR:", error.message);
        process.exit(1); // Detiene el proceso si ocurre un error irrecuperable.
    }
}
//Forzando un nuevo build
// Ejecutar la función de arranque principal.
startServer();