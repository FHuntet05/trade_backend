// RUTA: backend/scripts/verifyPassword.js
// --- SCRIPT DE DIAGNÓSTICO FINAL ---

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');
const User = require('../models/userModel');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const verifyAdminPassword = async () => {
  console.log('--- [SCRIPT DE VERIFICACIÓN DE CONTRASEÑA] ---');
  
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('❌ Error: Proporciona un username y una contraseña.');
    console.log('Uso: node scripts/verifyPassword.js <username> <password>');
    process.exit(1);
  }

  const username = args[0];
  const passwordToTest = args[1];
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.error('❌ Error: MONGO_URI no definida en .env');
    process.exit(1);
  }

  console.log('🔄 Conectando a la base de datos...');
  try {
    await mongoose.connect(mongoUri);
    console.log('✅ Conexión a MongoDB establecida.');
  } catch (error) {
    console.error('❌ Error de conexión a MongoDB:', error.message);
    process.exit(1);
  }

  try {
    console.log(`🔎 Buscando al admin con username: "${username}"...`);
    
    // Misma consulta exacta que en el controlador de login
    const adminUser = await User.findOne({ 
        username: username,
        role: 'admin' 
    }).select('+password');

    if (!adminUser) {
      console.log('❌ FALLO CRÍTICO: No se encontró ningún usuario con ese username y el rol "admin".');
      await mongoose.disconnect();
      process.exit(1);
    }
    
    console.log('👤 Usuario admin encontrado.');
    console.log('🔑 Hash de contraseña recuperado de la BD:', adminUser.password);

    console.log(`\n⚖️  Comparando la contraseña proporcionada ("${passwordToTest}") con el hash guardado...`);
    
    const isMatch = await bcrypt.compare(passwordToTest, adminUser.password);

    console.log('\n================== RESULTADO ==================');
    if (isMatch) {
      console.log('✅ VERDADERO (true): La contraseña coincide.');
    } else {
      console.log('❌ FALSO (false): La contraseña NO coincide.');
    }
    console.log('=============================================');

  } catch (error) {
    console.error('❌ Error durante la operación:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de la base de datos.');
    process.exit(0);
  }
};

verifyAdminPassword();