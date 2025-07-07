// backend/index.js (VERSIÓN CON CORS CONFIGURADO PARA PRODUCCIÓN)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// --- INICIO DE LA CONFIGURACIÓN DE CORS ---
// Define los orígenes (dominios) que tienen permiso para acceder a tu backend.
const whitelist = [
    'https://linker-frontend.onrender.com', // La URL de tu frontend en Render
    'http://localhost:5173'                 // La URL por defecto de Vite para desarrollo local
];

const corsOptions = {
    origin: function (origin, callback) {
        // La lógica: si el origen de la petición está en nuestra whitelist (o si no hay origen, como en peticiones de Postman),
        // entonces permitimos la petición (callback(null, true)).
        // Si no está en la whitelist, la rechazamos con un error de CORS (callback(new Error('Not allowed by CORS'))).
        if (whitelist.indexOf(origin) !== -1 || !origin) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true, // Permite que las cookies y cabeceras de autorización se envíen
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', // Métodos HTTP permitidos
};

// Usa el middleware de CORS con las opciones que definimos.
app.use(cors(corsOptions));
// --- FIN DE LA CONFIGURACIÓN DE CORS ---

app.use(express.json());

// Conectar a MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB conectado exitosamente.'))
  .catch(err => console.error('Error de conexión a MongoDB:', err));

// --- RUTAS DE LA API ---
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/tools', require('./routes/toolRoutes'));
app.use('/api/ranking', require('./routes/rankingRoutes'));
app.use('/api/wallet', require('./routes/walletRoutes'));
app.use('/api/team', require('./routes/teamRoutes'));
app.use('/api/tasks', require('./routes/taskRoutes'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));