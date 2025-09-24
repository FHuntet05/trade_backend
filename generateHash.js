// backend/generateHash.js
const bcrypt = require('bcryptjs');

async function createHash() {
  const password = 'ESTABA23'; // <-- CAMBIE ESTO
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);
  
  console.log('Su nueva contraseña hasheada es:');
  console.log(hashedPassword);
}

createHash();