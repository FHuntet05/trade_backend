// backend/controllers/paymentController.js (VERSIÓN FINAL CON LÓGICA ASÍNCRONA PARA PRECIOS)

const { ethers } = require('ethers');
const { TronWeb } = require('tronweb'); 
const CryptoWallet = require('../models/cryptoWalletModel');
// Importamos la función getPrice de nuestro servicio de precios.
// Ahora sabemos que esta función es asíncrona porque consulta la base de datos.
const { getPrice } = require('../services/priceService');

// El nodo HD se crea exitosamente a partir de la variable de entorno.
const hdNode = ethers.utils.HDNode.fromMnemonic(process.env.MASTER_SEED_PHRASE);

/**
 * Controlador para generar o recuperar una dirección de depósito para un usuario.
 */
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

/**
 * Devuelve los precios actuales de las criptomonedas soportadas.
 * Esta función ahora es ASÍNCRONA porque 'getPrice' consulta la base de datos.
 */
const getPrices = async (req, res) => {
    try {
        // Hacemos las llamadas a la base de datos en paralelo para mayor eficiencia.
        const [bnbPrice, trxPrice] = await Promise.all([
            getPrice('BNB'),
            getPrice('TRX')
        ]);

        const prices = {
            BNB: bnbPrice,
            TRX: trxPrice,
            USDT: 1, // USDT siempre es 1
        };

        // Verificamos que los precios se hayan cargado desde la base de datos.
        if (!prices.BNB || !prices.TRX) {
            console.warn("[API] Solicitud de precios mientras el servicio aún no los ha guardado en la DB.");
            return res.status(503).json({ message: 'El servicio de precios no está disponible temporalmente. Intente de nuevo en un minuto.' });
        }

        res.status(200).json(prices);

    } catch (error) {
        console.error("Error al obtener los precios desde el controlador:", error);
        res.status(500).json({ message: "Error interno al obtener los precios." });
    }
};

module.exports = {
  generateAddress,
  getPrices,
};