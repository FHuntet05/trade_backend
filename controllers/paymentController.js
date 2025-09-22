// RUTA: backend/controllers/paymentController.js (VERSIÓN "NEXUS - STATIC BNB ARCHITECTURE")

const { ethers } = require('ethers');
const CryptoWallet = require('../models/cryptoWalletModel');
const { getPrice } = require('../services/priceService');
const blockchainService = require('../services/blockchainService');
const asyncHandler = require('express-async-handler');

const hdNode = ethers.utils.HDNode.fromMnemonic(process.env.MASTER_SEED_PHRASE);

const getOrCreateUserBscAddress = async (userId) => {
  let wallet = await CryptoWallet.findOne({ user: userId, chain: 'BSC' });
  if (wallet) {
    return wallet.address;
  }
  console.log(`[WalletGen] Creando nueva wallet BSC para el usuario ${userId}`);
  const lastWallet = await CryptoWallet.findOne().sort({ derivationIndex: -1 });
  const newIndex = lastWallet ? lastWallet.derivationIndex + 1 : 0;
  const derivedNode = hdNode.derivePath(`m/44'/60'/0'/0/${newIndex}`);
  const newAddress = derivedNode.address;
  const currentBlock = await blockchainService.provider.getBlockNumber();
  wallet = new CryptoWallet({
    user: userId,
    chain: 'BSC',
    derivationIndex: newIndex,
    address: newAddress,
    lastScannedBlock: currentBlock,
  });
  await wallet.save();
  return newAddress;
};

const getDepositOptions = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const bscAddress = await getOrCreateUserBscAddress(userId);

    // [NEXUS REFINEMENT] - INICIO DE LA MODIFICACIÓN
    // 1. Añadimos STATIC_WALLET_BNB a la lista de wallets a leer del entorno.
    const staticWallets = {
        TRC20_USDT: process.env.STATIC_WALLET_TRC20_USDT || null,
        TRX: process.env.STATIC_WALLET_TRX || null,
        LTC: process.env.STATIC_WALLET_LTC || null,
        BNB: process.env.STATIC_WALLET_BNB || null, // Se añade BNB aquí.
    };
    
    const depositOptions = [
        {
            id: 'bep20-usdt',
            name: 'BEP20-USDT',
            logo: 'https://i.postimg.cc/Qd05p24c/usdt.png',
            chain: 'BSC',
            type: 'dynamic',
            address: bscAddress,
            memo: null,
            warning: 'Esta es tu dirección única. Solo envía USDT en la red BEP20 (Binance Smart Chain).',
        },
        // 2. Eliminamos la entrada de BNB que usaba la dirección dinámica.
        // ...(El antiguo objeto de BNB ha sido eliminado)

        // 3. Añadimos BNB como una opción estática, igual que las demás.
        ...(staticWallets.BNB ? [{
            id: 'bep20-bnb',
            name: 'BNB',
            logo: 'https://i.postimg.cc/R01Gw1bC/bnb.png',
            chain: 'BSC',
            type: 'static_manual', // Su tipo ahora es estático.
            address: staticWallets.BNB, // Usa la dirección del .env
            memo: null,
            warning: 'Depósito manual. Tras pagar, contacta a soporte con el TXID para acreditar tu saldo.', // Mensaje estandarizado.
        }] : []),
        ...(staticWallets.TRC20_USDT ? [{
            id: 'trc20-usdt',
            name: 'TRC20-USDT',
            logo: 'https://i.postimg.cc/Qd05p24c/usdt.png',
            chain: 'TRON',
            type: 'static_manual',
            address: staticWallets.TRC20_USDT,
            memo: null,
            warning: 'Depósito manual. Tras pagar, contacta a soporte con el TXID para acreditar tu saldo.',
        }] : []),
        ...(staticWallets.TRX ? [{
            id: 'tron-trx',
            name: 'TRX',
            logo: 'https://i.postimg.cc/FsYKM561/trx.png',
            chain: 'TRON',
            type: 'static_manual',
            address: staticWallets.TRX,
            memo: null,
            warning: 'Depósito manual. Tras pagar, contacta a soporte con el TXID para acreditar tu saldo.',
        }] : []),
        ...(staticWallets.LTC ? [{
            id: 'litecoin-ltc',
            name: 'LTC',
            logo: 'https://i.postimg.cc/0j0V421X/ltc.png',
            chain: 'LTC',
            type: 'static_manual',
            address: staticWallets.LTC,
            memo: null,
            warning: 'Depósito manual. Tras pagar, contacta a soporte con el TXID para acreditar tu saldo.',
        }] : []),
    ];
    // [NEXUS REFINEMENT] - FIN DE LA MODIFICACIÓN

    res.json(depositOptions);
});

const generateAddress = async (req, res) => {
  res.status(410).json({ message: 'Este endpoint ha sido deprecado. Usa GET /payment/deposit-options en su lugar.' });
};

const getPrices = asyncHandler(async (req, res) => {
    const [bnbPrice, trxPrice, ltcPrice] = await Promise.all([
        getPrice('BNB'),
        getPrice('TRX'),
        getPrice('LTC'),
    ]);
    const prices = {
        BNB: bnbPrice,
        TRX: trxPrice,
        LTC: ltcPrice,
        USDT: 1,
    };
    res.status(200).json(prices);
});

module.exports = {
  getDepositOptions,
  generateAddress,
  getPrices,
};