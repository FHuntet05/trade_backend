// backend/controllers/paymentController.js (VERSIÓN FINAL LIMPIA)
const { ethers } = require('ethers');
const { TronWeb } = require('tronweb'); 
const CryptoWallet = require('../models/cryptoWalletModel');

// El nodo HD se crea exitosamente a partir de la variable de entorno.
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