// backend/index.js (VERSIÓN FINALÍSIMA v32.1 - LÓGICA COMPLETA)

// --- IMPORTS Y CONFIGURACIÓN INICIAL ---
// Módulos necesarios para el servidor, la base de datos y el bot de Telegram.
const express = require('express');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf');
const morgan = require('morgan');
const crypto = require('crypto');
const dotenv = require('dotenv');
const colors = require('colors');
const { startWatcher } = require('./services/blockchainWatcherService');
const connectDB = require('./config/db');
const User = require('./models/userModel'); // Asegúrese de que la ruta a su modelo es correcta

console.log('[SISTEMA] Iniciando aplicación NEURO LINK...');
dotenv.config();

// --- VERIFICACIÓN DE VARIABLES DE ENTORNO ---
// Función para asegurar que todas las variables críticas están definidas antes de arrancar.
function checkEnvVariables() {
    console.log('[SISTEMA] Verificando variables de entorno críticas...');
    const requiredVars = ['MONGO_URI', 'JWT_SECRET', 'TELEGRAM_BOT_TOKEN', 'FRONTEND_URL', 'ADMIN_URL', 'BACKEND_URL', 'BSCSCAN_API_KEY', 'MASTER_SEED_PHRASE'];
    const missingVars = requiredVars.filter(v => !process.env[v]);
    if (missingVars.length > 0) {
        console.error(`!! ERROR FATAL: FALTAN VARIABLES DE ENTORNO: ${missingVars.join(', ')}`.red.bold);
        process.exit(1);
    }
    console.log('[SISTEMA] ✅ Todas las variables de entorno críticas están presentes.');
}
checkEnvVariables();

// --- CONEXIÓN A BASE DE DATOS ---
connectDB();

// --- IMPORTACIÓN DE RUTAS DE LA API ---
const authRoutes = require('./routes/authRoutes');
const toolRoutes = require('./routes/toolRoutes');
const rankingRoutes = require('./routes/rankingRoutes');
const walletRoutes = require('./routes/walletRoutes');
const teamRoutes = require('./routes/teamRoutes');
const taskRoutes = require('./routes/taskRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const treasuryRoutes = require('./routes/treasuryRoutes');
const userRoutes = require('./routes/userRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// --- CONFIGURACIÓN DE EXPRESS Y MIDDLEWARES ---
const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

app.disable('etag');
const whitelist = [process.env.FRONTEND_URL, process.env.ADMIN_URL];
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || whitelist.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.error(`[CORS] ❌ Origen RECHAZADO: '${origin}'. No está en la whitelist: [${whitelist.join(', ')}]`.red.bold);
            callback(new Error(`Origen no permitido por CORS: ${origin}`));
        }
    },
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());
// app.use(morgan('dev')); // Descomentar para logging detallado de peticiones HTTP

// --- REGISTRO DE RUTAS DE LA API ---
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/tools', toolRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/treasury', treasuryRoutes);
app.use('/api/users', userRoutes);

// =========================================================================
// ================== LÓGICA DEL BOT DE TELEGRAM (CORREGIDA) ===============
// =========================================================================

const WELCOME_MESSAGE = `
👋 ¡Bienvenido a NEURO LINK!\n\n
🔐 Tu acceso privilegiado al universo de la minería digital avanzada. Aquí, cada acción te acerca a recompensas exclusivas en *NTX*.\n\n
📘 ¿Cómo funciona?\n
1️⃣ Activa tu Minería: ⛏️ Inicia tu sesión cada 24 horas para comenzar a generar NTX, el token neural del ecosistema.\n
2️⃣ Optimiza tu Potencia: ⚙️ Accede a la tienda y adquiere herramientas con USDT, TRX o BNB. Aumenta tu velocidad de minería y maximiza tus beneficios.\n
3️⃣ Expande tu Red: 🧠 Invita a tus aliados con tu enlace personal. Obtén recompensas por su actividad y construye un flujo de ingresos pasivo.\n
4️⃣ Reclama y Evoluciona: 💎 Recupera tus NTX minados y fortalece tu saldo para futuras estrategias.\n\n
✨ Estás listo para comenzar tu travesía. Pulsa el botón inferior y desata el poder de la minería inteligente 🚀
`;
const escapeMarkdownV2 = (text) => text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');

bot.command('start', async (ctx) => {
    try {
        const referredId = ctx.from.id.toString(); // El ID del usuario que ejecuta el comando.
        
        // --- INICIO DE LA LÓGICA DE EXTRACCIÓN DE REFERENTE (COMPLETA) ---
        // Esta es la corrección crítica que implementa su lógica.
        let referrerId = null;
        
        // MÉTODO A: El código viene en el payload (cuando se hace clic en un enlace t.me/bot?start=CODIGO).
        if (ctx.startPayload) {
            referrerId = ctx.startPayload.trim();
            console.log(`[Bot /start] Referente detectado desde startPayload: ${referrerId}`);
        } 
        // MÉTODO B: El código viene como texto después del comando (cuando se escribe /start CODIGO).
        else {
            const parts = ctx.message.text.split(' ');
            if (parts.length > 1 && parts[1]) {
                referrerId = parts[1].trim();
                console.log(`[Bot /start] Referente detectado desde texto del mensaje: ${referrerId}`);
            }
        }
        // --- FIN DE LA LÓGICA DE EXTRACCIÓN ---

        console.log(`[Bot /start] Petición de inicio. Usuario: ${referredId}. Potencial Referente: ${referrerId}`.cyan);

        // --- PROCESAMIENTO DE REFERIDO EN EL BACKEND ---
        
        // 1. Buscamos al usuario referido.
        let referredUser = await User.findOne({ telegramId: referredId });

        // 2. Si no existe, preparamos un nuevo documento de usuario.
        if (!referredUser) {
            console.log(`[Bot /start] Usuario ${referredId} no encontrado. Creando nuevo perfil.`);
            const username = ctx.from.username || `user_${referredId}`;
            const fullName = `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim();
            referredUser = new User({
                telegramId: referredId,
                username: username,
                fullName: fullName || username,
                language: ctx.from.language_code || 'es',
            });
        }

        // 3. Aplicamos la lógica de referido si se cumplen todas las condiciones.
        const canBeReferred = referrerId && referrerId !== referredId && !referredUser.referredBy;
        if (canBeReferred) {
            console.log(`[Bot /start] Procesando referido del referente ${referrerId} para el usuario ${referredId}.`);
            const referrerUser = await User.findOne({ telegramId: referrerId });

            if (referrerUser) {
                // Si el referente existe, establecemos la relación.
                console.log(`[Bot /start] Referente ${referrerUser.username} válido encontrado. Estableciendo relación.`);
                referredUser.referredBy = referrerUser._id;
                
                // Actualizamos la lista de referidos del referente para que lo vea en su equipo.
                if (!referrerUser.referrals.some(ref => ref.user.equals(referredUser._id))) {
                    referrerUser.referrals.push({ level: 1, user: referredUser._id });
                    await referrerUser.save();
                    console.log(`[Bot /start] El usuario ${referrerUser.username} ha sido actualizado con su nuevo referido.`);
                }
            } else {
                console.warn(`[Bot /start] ADVERTENCIA: Referente con ID ${referrerId} no encontrado en la BD.`.yellow);
            }
        }

        // 4. Guardamos el estado final del usuario referido.
        await referredUser.save();
        console.log(`[Bot /start] Perfil del usuario ${referredId} guardado/actualizado en la BD.`);
        
        // 5. Respondemos al usuario con una URL LIMPIA.
        const webAppUrl = process.env.FRONTEND_URL;
        
        await ctx.replyWithMarkdownV2(
            escapeMarkdownV2(WELCOME_MESSAGE),
            Markup.inlineKeyboard([
                Markup.button.webApp('🚀 Abrir App', webAppUrl)
            ])
        );

    } catch (error) {
        console.error('[Bot /start] ERROR FATAL EN EL COMANDO START:'.red.bold, error);
        await ctx.reply('Lo sentimos, ha ocurrido un error al procesar tu solicitud.');
    }
});

// --- CONFIGURACIÓN DE COMANDOS Y WEBHOOK (SIN CAMBIOS) ---
bot.telegram.setMyCommands([{ command: 'start', description: 'Inicia la aplicación' }]);

const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET || crypto.randomBytes(32).toString('hex');
const secretPath = `/api/telegram-webhook/${secretToken}`;
app.post(secretPath, (req, res) => bot.handleUpdate(req.body, res));

// --- MIDDLEWARES DE ERROR Y ARRANQUE DEL SERVIDOR (SIN CAMBIOS) ---
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, async () => {
    console.log(`[SERVIDOR] 🚀 Servidor corriendo en puerto ${PORT}`.yellow.bold);
    startWatcher(); 
    try {
        const botInfo = await bot.telegram.getMe();
        console.log(`[SERVIDOR] ✅ Conectado como bot: ${botInfo.username}.`);
        const webhookUrl = `${process.env.BACKEND_URL}${secretPath}`;
        await bot.telegram.setWebhook(webhookUrl, { secret_token: secretToken, drop_pending_updates: true });
        console.log(`[SERVIDOR] ✅ Webhook configurado en: ${webhookUrl}`.green.bold);
    } catch (telegramError) {
        console.error("[SERVIDOR] ❌ ERROR AL CONFIGURAR TELEGRAM:", telegramError.message.red);
    }
});

process.on('unhandledRejection', (err, promise) => {
    console.error(`❌ ERROR NO MANEJADO: ${err.message}`.red.bold, err);
    server.close(() => process.exit(1));
});