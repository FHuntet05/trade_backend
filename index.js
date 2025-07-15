// backend/index.js (PROCEDIMIENTO DE DEPURACIÓN FINAL)

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { Telegraf } = require('telegraf');
const morgan = 'morgan';
require('dotenv').config();

console.log('[DEBUG] Dependencias base cargadas.');

// --- Importación de Rutas (TODAS DESHABILITADAS) ---
 const authRoutes = require('./routes/authRoutes');
 const toolRoutes = require('./routes/toolRoutes');
const rankingRoutes = require('./routes/rankingRoutes');
// const walletRoutes = require('./routes/walletRoutes');
 const teamRoutes = require('./routes/teamRoutes');
 const taskRoutes = require('./routes/taskRoutes');
// const paymentRoutes = require('./routes/paymentRoutes');
 const adminRoutes = require('./routes/adminRoutes');
 const treasuryRoutes = require('./routes/treasuryRoutes');

console.log('[DEBUG] Fase de importación de rutas omitida.');

const app = express();

if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error("ERROR FATAL: TELEGRAM_BOT_TOKEN no definido.");
    process.exit(1);
}
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

console.log('[DEBUG] App de Express y Bot de Telegraf inicializados.');

// Configuración básica para que la app corra
app.use(express.json());
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// --- Uso de Rutas (TODAS DESHABILITADAS) ---
 app.use('/api/auth', authRoutes);
 app.use('/api/tools', toolRoutes);
 app.use('/api/ranking', rankingRoutes);
// app.use('/api/wallet', walletRoutes);
 app.use('/api/team', teamRoutes);
 app.use('/api/tasks', taskRoutes);
// app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);
 app.use('/api/treasury', treasuryRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`[DEBUG] Servidor de depuración corriendo en el puerto ${PORT}.`);
    console.log('--- COMIENCE EL PROCESO DE HABILITACIÓN DE RUTAS ---');
});