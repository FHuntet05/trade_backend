// backend/controllers/paymentController.js
const { ethers } = require('ethers');
const { default: TronWeb } = require('tronweb'); // <<< 1. Importar TronWeb
const CryptoWallet = require('../models/cryptoWalletModel');

// --- Configuración de Wallets ---
const hdNode = ethers.utils.HDNode.fromMnemonic(process.env.MASTER_SEED_PHRASE);
// Para Tron, la derivación HD es menos común. La práctica estándar es generar wallets a partir de una clave privada.
// Para mantener la consistencia, derivaremos una clave privada de la semilla maestra para Tron.
const tronMainPrivateKey = hdNode.derivePath(`m/44'/195'/0'/0/0`).privateKey; // Usamos la ruta de derivación de TRON
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
    
    // <<< 2. Lógica actualizada para manejar ambas cadenas
    if (chain === 'BSC') {
      const derivedNode = hdNode.derivePath(`m/44'/60'/0'/0/${newIndex}`);
      newAddress = derivedNode.address;
    } else if (chain === 'TRON') {
      // En Tron, en lugar de derivar por índice, generamos una cuenta desde la librería ya instanciada.
      // TronWeb gestiona la generación. Para crear direcciones únicas, podemos usar un enfoque diferente.
      // La forma más segura y simple con tronweb es derivar una clave privada por índice.
      const childNode = hdNode.derivePath(`m/44'/195'/0'/0/${newIndex}`);
      const account = await tronWeb.address.fromPrivateKey(childNode.privateKey.substring(2)); // quitamos el '0x'
      newAddress = account;
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
    console.error('Error al generar la dirección de depósito:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
};

module.exports = {
  generateAddress,
};