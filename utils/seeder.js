// backend/utils/seeder.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Tool = require('../models/toolModel'); // Asegúrate de que la ruta sea correcta

// Cargar variables de entorno
dotenv.config(); // Le decimos que busque el .env en la carpeta raíz del backend

// --- DATOS COMPLETOS DE LAS 10 HERRAMIENTAS CON ROI DE 3 DÍAS ---
const tools = [
  // Ganancia NTX/Día = (Precio USDT / 3) * 10000
  { name: 'VIP 1', vipLevel: 1, price: 3, durationDays: 365, miningBoost: 10000, imageUrl: '/assets/tools/vip1.png' },
  { name: 'VIP 2', vipLevel: 2, price: 8, durationDays: 365, miningBoost: 26666, imageUrl: '/assets/tools/vip2.png' },
  { name: 'VIP 3', vipLevel: 3, price: 16, durationDays: 365, miningBoost: 53333, imageUrl: '/assets/tools/vip3.png' },
  { name: 'VIP 4', vipLevel: 4, price: 32, durationDays: 365, miningBoost: 106666, imageUrl: '/assets/tools/vip4.png' },
  { name: 'VIP 5', vipLevel: 5, price: 50, durationDays: 365, miningBoost: 166666, imageUrl: '/assets/tools/vip5.png' },
  { name: 'VIP 6', vipLevel: 6, price: 100, durationDays: 365, miningBoost: 333333, imageUrl: '/assets/tools/vip6.png' },
  { name: 'VIP 7', vipLevel: 7, price: 150, durationDays: 365, miningBoost: 500000, imageUrl: '/assets/tools/vip7.png' },
  { name: 'VIP 8', vipLevel: 8, price: 250, durationDays: 365, miningBoost: 833333, imageUrl: '/assets/tools/vip8.png' },
  { name: 'VIP 9', vipLevel: 9, price: 350, durationDays: 365, miningBoost: 1166666, imageUrl: '/assets/tools/vip9.png' },
  { name: 'VIP 10', vipLevel: 10, price: 500, durationDays: 365, miningBoost: 1666666, imageUrl: '/assets/tools/vip10.png' },
];

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB conectado para el seeder.');
  } catch (err) {
    console.error(`Error de conexión del seeder: ${err.message}`);
    process.exit(1);
  }
};

const importData = async () => {
  await connectDB();
  try {
    // 1. Borrar todas las herramientas existentes
    await Tool.deleteMany();
    console.log('Herramientas antiguas eliminadas.');

    // 2. Insertar las nuevas herramientas
    await Tool.insertMany(tools);
    console.log('Nuevas herramientas importadas con éxito.');
    process.exit();
  } catch (error) {
    console.error(`Error importando datos: ${error}`);
    process.exit(1);
  }
};

const destroyData = async () => {
  await connectDB();
  try {
    await Tool.deleteMany();
    console.log('Todas las herramientas han sido eliminadas.');
    process.exit();
  } catch (error) {
    console.error(`Error eliminando datos: ${error}`);
    process.exit(1);
  }
};

// Lógica para ejecutar desde la línea de comandos
if (process.argv[2] === '-d') {
  destroyData(); // Si se ejecuta con 'node seeder.js -d', borra los datos
} else {
  importData(); // Por defecto, importa los datos
}