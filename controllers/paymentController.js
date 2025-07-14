// backend/controllers/paymentController.js
const { ethers } = require('ethers');
const { TronWeb } = require('tronweb'); 
const CryptoWallet = require('../models/cryptoWalletModel');

// Definimos el nodo maestro globalmente, ya que no depende de nada más que la variable de entorno.
const hdNode = ethers.utils.HDNode.fromMnemonic(process.env.MASTER_SEED_PHRASE);

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
      // <<< MEJORA ESTRUCTURAL: Instanciamos TronWeb solo cuando se necesita >>>
      // Esto evita errores de inicialización globales que pueden causar dependencias circulares.
      
      // 1. Derivamos la clave privada para la instancia de TronWeb.
      const tronMainPrivateKey = hdNode.derivePath(`m/44'/195'/0'/0/0`).privateKey.substring(2);

      // 2. Creamos la instancia de TronWeb dentro de la función.
      const tronWeb = new TronWeb({
          fullHost: 'https://api.trongrid.io',
          headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY },
          privateKey: tronMainPrivateKey
      });

      // 3. Derivamos la clave privada para la dirección específica del usuario.
      const childNode = hdNode.derivePath(`m/44'/195'/0'/0/${newIndex}`);
      const privateKeyWithoutPrefix = childNode.privateKey.substring(2);
      
      // 4. Obtenemos la dirección.
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