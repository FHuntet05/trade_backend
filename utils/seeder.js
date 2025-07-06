// backend/utils/seeder.js

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Tool = require('../models/toolModel'); // Asegúrate de que la ruta sea correcta

// Cargar variables de entorno
dotenv.config(); // Le decimos que busque el .env en la carpeta raíz del backend

// Nuevos datos de las herramientas (VIP)
const tools = [
  {
    name: 'Herramienta de aceleración de minería',
    vipLevel: 1,
    price: 3,
    durationDays: 7,
    miningBoost: 10000,
    imageUrl: '/assets/tools/vip1.png', // Puedes ajustar las rutas de imagen si es necesario
  },
  {
    name: 'Herramienta de aceleración de minería',
    vipLevel: 2,
    price: 8,
    durationDays: 20,
    miningBoost: 30000,
    imageUrl: '/assets/tools/vip2.png',
  },
  {
    name: 'Herramienta de aceleración de minería',
    vipLevel: 3,
    price: 16,
    durationDays: 30,
    miningBoost: 70000,
    imageUrl: '/assets/tools/vip3.png',
  },
  {
    name: 'Herramienta de aceleración de minería',
    vipLevel: 4,
    price: 32,
    durationDays: 45,
    miningBoost: 150000,
    imageUrl: '/assets/tools/vip4.png',
  },
  {
    name: 'Herramienta de aceleración de minería',
    vipLevel: 5,
    price: 50,
    durationDays: 60,
    miningBoost: 320000,
    imageUrl: '/assets/tools/vip5.png',
  },
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