// RUTA: backend/scripts/createOrUpdateAdmin.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');
const User = require('../models/userModel'); // Asegúrate de que la ruta sea correcta

// --- PASO 1: Cargar las variables de entorno del archivo .env ---
// Esto es crucial para que el script pueda conectar a la base de datos.
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const createOrUpdateAdmin = async () => {
  // --- PASO 2: Obtener el username y la contraseña de los argumentos de la terminal ---
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('\n❌ Error: Faltan argumentos. Por favor, proporciona un username y una contraseña.');
    console.log('Uso: node scripts/createOrUpdateAdmin.js <username> <password>\n');
    process.exit(1); // Termina el script con un código de error
  }

  const username = args[0];
  const password = args[1];
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.error('\n❌ Error: La variable de entorno MONGO_URI no está definida en tu archivo .env.\n');
    process.exit(1);
  }

  // --- PASO 3: Conectar a la base de datos ---
  console.log('🔄 Conectando a la base de datos...');
  try {
    await mongoose.connect(mongoUri);
    console.log('✅ Conexión a MongoDB establecida con éxito.');
  } catch (error) {
    console.error('\n❌ Error de conexión a MongoDB:', error.message);
    process.exit(1);
  }

  try {
    // --- PASO 4: Buscar si el usuario ya existe ---
    console.log(`🔎 Buscando usuario con el username: "${username}"...`);
    let adminUser = await User.findOne({ username: username });

    if (adminUser) {
      console.log('👤 Usuario encontrado. Actualizando su rol y contraseña.');
    } else {
      console.log('🆕 Usuario no encontrado. Creando un nuevo administrador...');
      adminUser = new User({
        username: username,
        fullName: username, // Puedes cambiarlo después en el panel
        telegramId: `admin_${Date.now()}`, // ID único para administradores sin Telegram
      });
    }

    // --- PASO 5: Hashear la nueva contraseña ---
    console.log('🔒 Hasheando la contraseña...');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // --- PASO 6: Asignar los datos y guardar en la base de datos ---
    adminUser.password = hashedPassword;
    adminUser.role = 'admin'; // Asegurarse de que el rol sea 'admin'
    
    console.log('💾 Guardando los datos en la base de datos...');
    await adminUser.save();

    console.log('\n✨ ¡ÉXITO! ✨');
    console.log('=============================================');
    console.log('El administrador ha sido creado/actualizado.');
    console.log(`   Username: ${adminUser.username}`);
    console.log(`   Contraseña: ${password}`);
    console.log('=============================================');
    console.log('Puedes usar estas credenciales para iniciar sesión en el panel de administración.\n');

  } catch (error) {
    console.error('\n❌ Error durante la operación:', error);
  } finally {
    // --- PASO 7: Desconectar de la base de datos ---
    await mongoose.disconnect();
    console.log('🔌 Desconectado de la base de datos.');
    process.exit(0);
  }
};

createOrUpdateAdmin();