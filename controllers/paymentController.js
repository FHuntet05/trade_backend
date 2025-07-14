// backend/controllers/paymentController.js
const { ethers } = require('ethers');
const { TronWeb } = require('tronweb'); 
const CryptoWallet = require('../models/cryptoWalletModel');

// =================================================================================
// --- INICIO DEL BLOQUE DE DEPURACIÓN ---
// Vamos a imprimir la variable de entorno para ver qué está recibiendo Render.
console.log("--- INICIANDO DEPURACIÓN EN paymentController ---");

const seedPhrase = process.env.MASTER_SEED_PHRASE;

// 1. Verificar si la frase semilla existe.
if (!seedPhrase || seedPhrase.trim() === '') {
  console.error("!!! ERROR CRÍTICO: La variable de entorno MASTER_SEED_PHRASE está vacía o no definida.");
} else {
  // 2. Si existe, imprimir una versión ofuscada para confirmar que se está leyendo.
  // Esto es seguro para los logs, ya que no revela la semilla completa.
  const words = seedPhrase.split(' ');
  const firstWord = words[0];
  const lastWord = words[words.length - 1];
  console.log(`[DEBUG] MASTER_SEED_PHRASE leída. Comienza con "${firstWord}", termina con "${lastWord}", y tiene ${words.length} palabras.`);
}
// --- FIN DEL BLOQUE DE DEPURACIÓN ---
// =================================================================================

// Se crea un nodo maestro a partir de la frase semilla secreta.
const hdNode = ethers.utils.HDNode.fromMnemonic(seedPhrase);

// Se deriva una clave privada específica para Tron desde nuestro nodo maestro.
const tronMainPrivateKey = hdNode.derivePath(`m/44'/195'/0'/0/0`).privateKey;

// =================================================================================
// --- INICIO DEL SEGUNDO BLOQUE DE DEPURACIÓN ---
// 3. Verificar la clave privada derivada para Tron antes de usarla.
console.log(`[DEBUG] ¿La clave privada de Tron (tronMainPrivateKey) es una cadena de texto? ${typeof tronMainPrivateKey === 'string'}`);
if (typeof tronMainPrivateKey === 'string') {
  console.log(`[DEBUG] Longitud de la clave privada de Tron: ${tronMainPrivateKey.length}`); // Debería ser 66 (0x + 64 caracteres hexadecimales)
} else {
  console.error("!!! ERROR: tronMainPrivateKey no se derivó correctamente. Probablemente hdNode es nulo.");
}
console.log("--- FIN DE LA DEPURACIÓN ---");
// --- FIN DEL SEGUNDO BLOQUE DE DEPURACIÓN ---
// =================================================================================

// Se instancia TronWeb con la configuración necesaria.
const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io',
    headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY },
    privateKey: tronMainPrivateKey
});

const generateAddress = async (req, res) => {
  const { chain } = req.body;
  const userId = req.user.id;

  if (!chain) {
    return res.status(400).json({ message: 'Se requiere la cadena (chain).' });
  }

  try {
    let wallet = await CryptoWallet.findOne({ user: userId, chain });
    if (wallet) {
      return res.status(200).json({ address: wallet.address });
    }

    const lastWallet = await CryptoWallet.findOne().sort({ derivationIndex: -1 });
    const newIndex = lastWallet ? lastWallet.derivationIndex + 1 : 0;
    
    let newAddress;
    
    if (chain === 'BSC') {
      const derivedNode = hdNode.derivePath(`m/44'/60'/0'/0/${newIndex}`);
      newAddress = derivedNode.address;
    } else if (chain === 'TRON') {
      const childNode = hdNode.derivePath(`m/44'/195'/0'/0/${newIndex}`);
      const privateKeyWithoutPrefix = childNode.privateKey.substring(2);
      const accountAddress = await tronWeb.address.fromPrivateKey(privateKeyWithoutPrefix);
      newAddress = accountAddress;
    } else {
      return res.status(400).json({ message: 'Cadena no soportada.' });
    }
    
    wallet = new CryptoWallet({
      user: userId,
      chain,
      address: newAddress,
      derivationIndex: newIndex,
    });
    await wallet.save();
    
    res.status(201).json({ address: newAddress });
  } catch (error) {
    console.error('Error detallado en generateAddress:', error);
    res.status(500).json({ message: 'Error interno del servidor al generar dirección.' });
  }
};

module.exports = {
  generateAddress,
};