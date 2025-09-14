// backend/controllers/paymentController.js (FASE "FORTITUDO" - ENFOQUE BSC Y RPC CENTRALIZADO)

const { ethers } = require('ethers');
const CryptoWallet = require('../models/cryptoWalletModel');
const { getPrice } = require('../services/priceService');
// [FORTITUDO - REFACTOR] Importamos el servicio central para una conexión RPC unificada.
const blockchainService = require('../services/blockchainService');

// [FORTITUDO - ARQUITECTURA DE SEMILLA]
// Se mantiene el uso de la semilla maestra para la derivación de wallets, según la directiva.
const hdNode = ethers.utils.HDNode.fromMnemonic(process.env.MASTER_SEED_PHRASE);

/**
 * Controlador para generar o recuperar una dirección de depósito BSC para un usuario.
 */
const generateAddress = async (req, res) => {
  const { chain } = req.body;
  const userId = req.user.id;

  if (!chain || chain !== 'BSC') {
    return res.status(400).json({ message: 'Se requiere la cadena (chain) y debe ser "BSC".' });
  }

  try {
    // 1. Buscamos si la wallet BSC ya existe para este usuario.
    let wallet = await CryptoWallet.findOne({ user: userId, chain: 'BSC' });
    if (wallet) {
      return res.status(200).json({ address: wallet.address });
    }

    // --- Si la wallet no existe, procedemos a crearla ---
    console.log(`[WalletGen] Creando nueva wallet BSC para el usuario ${userId}`);
    
    // Se busca el último índice de derivación para asegurar que sea único.
    const lastWallet = await CryptoWallet.findOne().sort({ derivationIndex: -1 });
    const newIndex = lastWallet ? lastWallet.derivationIndex + 1 : 0;
    
    // Se deriva el nuevo nodo usando la ruta estándar para EVM.
    const derivedNode = hdNode.derivePath(`m/44'/60'/0'/0/${newIndex}`);
    const newAddress = derivedNode.address;
    
    const walletData = {
        user: userId,
        chain: 'BSC',
        derivationIndex: newIndex,
        address: newAddress,
    };

    // [FORTITUDO - REFACTOR] Usamos el proveedor centralizado para obtener el bloque actual.
    // Esto asegura que el monitor de transacciones no tenga que escanear desde el bloque génesis.
    const currentBlock = await blockchainService.provider.getBlockNumber();
    walletData.lastScannedBlock = currentBlock;
    console.log(`[WalletGen] Nueva wallet BSC ${newAddress} inicializada en el bloque: ${currentBlock}`);

    // Creamos y guardamos la nueva wallet en la base de datos.
    wallet = new CryptoWallet(walletData);
    await wallet.save();
    
    res.status(201).json({ address: newAddress });

  } catch (error) {
    console.error('Error detallado en generateAddress:', error);
    res.status(500).json({ message: 'Error interno del servidor al generar dirección.' });
  }
};

/**
 * Devuelve los precios actuales de las criptomonedas soportadas (enfocado en BSC).
 */
const getPrices = async (req, res) => {
    try {
        const bnbPrice = await getPrice('BNB');

        const prices = {
            BNB: bnbPrice,
            USDT: 1, // USDT es nuestra moneda base.
        };

        if (!prices.BNB) {
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