// backend/controllers/paymentController.js
const { ethers } = require('ethers');
const { TronWeb } = require('tronweb'); 
const CryptoWallet = require('../models/cryptoWalletModel');

// =================================================================================
console.log("--- INICIANDO DEPURACIÓN EN paymentController ---");
const seedPhrase = process.env.MASTER_SEED_PHRASE;
if (!seedPhrase || seedPhrase.trim() === '') {
  console.error("!!! ERROR CRÍTICO: La variable de entorno MASTER_SEED_PHRASE está vacía o no definida.");
} else {
  const words = seedPhrase.split(' ');
  const firstWord = words[0];
  const lastWord = words[words.length - 1];
  console.log(`[DEBUG] MASTER_SEED_PHRASE leída. Comienza con "${firstWord}", termina con "${lastWord}", y tiene ${words.length} palabras.`);
}
// =================================================================================

const hdNode = ethers.utils.HDNode.fromMnemonic(seedPhrase);
const tronMainPrivateKey_full = hdNode.derivePath(`m/44'/195'/0'/0/0`).privateKey;

// =================================================================================
// <<< LA SOLUCIÓN DEFINITIVA ESTÁ AQUÍ >>>
// El error "Invalid private key" ocurre porque ethers.js devuelve la clave con un prefijo "0x".
// La librería tronweb requiere la clave privada sin este prefijo.
// Vamos a eliminarlo explícitamente antes de pasarlo al constructor.
const tronMainPrivateKey = tronMainPrivateKey_full.substring(2);

console.log(`[DEBUG] ¿La clave privada de Tron (tronMainPrivateKey) es una cadena de texto? ${typeof tronMainPrivateKey === 'string'}`);
if (typeof tronMainPrivateKey === 'string') {
  // Ahora la longitud esperada es 64, no 66.
  console.log(`[DEBUG] Longitud de la clave privada de Tron (sin 0x): ${tronMainPrivateKey.length}`);
}
console.log("--- FIN DE LA DEPURACIÓN ---");
// =================================================================================

const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io',
    headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY },
    privateKey: tronMainPrivateKey // Pasamos la clave ya limpia
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
      // Aquí también nos aseguramos de quitar el prefijo "0x"
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