// backend/controllers/paymentController.js
const { ethers } = require('ethers');
const { TronWeb } = require('tronweb'); 
const CryptoWallet = require('../models/cryptoWalletModel');

// =================================================================================
// --- PRUEBA FINAL Y DEFINITIVA ---
// =================================================================================

console.log("--- DIAGNÓSTICO FINAL: Verificando MASTER_SEED_PHRASE ---");

const seedPhrase = process.env.MASTER_SEED_PHRASE;
let hdNode;

if (!seedPhrase || typeof seedPhrase !== 'string' || seedPhrase.split(' ').length < 12) {
    // Si la semilla es inválida, no intentamos crear el nodo y lanzamos un error claro.
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("!!! ERROR FATAL: MASTER_SEED_PHRASE es inválida o no está definida.");
    console.error(`!!! Tipo recibido: ${typeof seedPhrase}`);
    if (seedPhrase) {
        console.error(`!!! Contenido parcial recibido: "${seedPhrase.substring(0, 10)}..."`);
    }
    console.error("!!! VERIFICA LA VARIABLE DE ENTORNO EN RENDER. LA APLICACIÓN NO PUEDE ARRANCAR.");
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    // Forzamos el cierre del proceso para que el error sea visible y claro en los logs.
    process.exit(1); 
}

try {
    // Intentamos crear el nodo HD. Si esto falla, el catch lo capturará.
    hdNode = ethers.utils.HDNode.fromMnemonic(seedPhrase);
    console.log("[DIAGNÓSTICO] OK: El nodo HD (hdNode) se ha creado exitosamente desde la frase semilla.");
} catch (e) {
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("!!! ERROR FATAL: ethers.utils.HDNode.fromMnemonic() ha fallado.");
    console.error("!!! Esto casi siempre significa que la frase semilla NO es un mnemónico válido (BIP39).");
    console.error("!!! Error original:", e.message);
    console.error("!!! Por favor, verifica que la frase semilla sea correcta y no contenga caracteres extraños.");
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    process.exit(1);
}

// =================================================================================
// --- FIN DE LA PRUEBA ---
// =================================================================================


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
      const tronMainPrivateKey = hdNode.derivePath(`m/44'/195'/0'/0/0`).privateKey.substring(2);
      const tronWeb = new TronWeb({
          fullHost: 'https://api.trongrid.io',
          headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY },
          privateKey: tronMainPrivateKey
      });
      const childNode = hdNode.derivePath(`m/44'/195'/0'/0/${newIndex}`);
      const privateKeyWithoutPrefix = childNode.privateKey.substring(2);
      newAddress = await tronWeb.address.fromPrivateKey(privateKeyWithoutPrefix);
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