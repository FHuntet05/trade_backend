// backend/controllers/paymentController.js (VERSIÓN CON INICIALIZACIÓN DE BLOQUE INTELIGENTE)

const { ethers } = require('ethers');
const { TronWeb } = require('tronweb'); 
const CryptoWallet = require('../models/cryptoWalletModel');
const { getPrice } = require('../services/priceService');

const hdNode = ethers.utils.HDNode.fromMnemonic(process.env.MASTER_SEED_PHRASE);
const bscProvider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');

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
    // 1. Buscamos si la wallet ya existe.
    let wallet = await CryptoWallet.findOne({ user: userId, chain });
    if (wallet) {
      return res.status(200).json({ address: wallet.address });
    }

    // --- Si la wallet no existe, procedemos a crearla ---
    console.log(`[WalletGen] Creando nueva wallet ${chain} para el usuario ${userId}`);
    const lastWallet = await CryptoWallet.findOne().sort({ derivationIndex: -1 });
    const newIndex = lastWallet ? lastWallet.derivationIndex + 1 : 0;
    
    let newAddress;
    const walletData = {
        user: userId,
        chain,
        derivationIndex: newIndex,
    };

    if (chain === 'BSC') {
      const derivedNode = hdNode.derivePath(`m/44'/60'/0'/0/${newIndex}`);
      newAddress = derivedNode.address;
      walletData.address = newAddress;

      // [SOLUCIÓN PERMANENTE] - INICIO DE LA MODIFICACIÓN
      // Obtenemos el bloque actual de la red para que el monitor no empiece desde cero.
      const currentBlock = await bscProvider.getBlockNumber();
      walletData.lastScannedBlock = currentBlock;
      console.log(`[WalletGen] Nueva wallet BSC inicializada en el bloque: ${currentBlock}`);
      // [SOLUCIÓN PERMANENTE] - FIN DE LA MODIFICACIÓN

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
      walletData.address = newAddress;

      // [SOLUCIÓN PERMANENTE] - INICIO DE LA MODIFICACIÓN
      // Para TRON, usamos el timestamp actual.
      const currentTimestamp = Date.now();
      walletData.lastScannedTimestamp = currentTimestamp;
      console.log(`[WalletGen] Nueva wallet TRON inicializada en el timestamp: ${currentTimestamp}`);
      // [SOLUCIÓN PERMANENTE] - FIN DE LA MODIFICACIÓN

    } else {
      return res.status(400).json({ message: 'Cadena no soportada.' });
    }
    
    // Creamos y guardamos la nueva wallet con todos los datos, incluyendo el bloque/timestamp inicial.
    wallet = new CryptoWallet(walletData);
    await wallet.save();
    
    res.status(201).json({ address: newAddress });
  } catch (error) {
    console.error('Error detallado en generateAddress:', error);
    res.status(500).json({ message: 'Error interno del servidor al generar dirección.' });
  }
};

/**
 * Devuelve los precios actuales de las criptomonedas soportadas.
 */
const getPrices = async (req, res) => {
    try {
        const [bnbPrice, trxPrice] = await Promise.all([
            getPrice('BNB'),
            getPrice('TRX')
        ]);

        const prices = {
            BNB: bnbPrice,
            TRX: trxPrice,
            USDT: 1,
        };

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