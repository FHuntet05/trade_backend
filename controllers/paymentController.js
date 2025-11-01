// RUTA: backend/controllers/paymentController.js (VERSIÓN "NEXUS - STATIC BNB ARCHITECTURE")

const { ethers } = require('ethers');
const CryptoWallet = require('../models/cryptoWalletModel');
const Setting = require('../models/settingsModel');
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
        const settings = await Setting.findOne({ singleton: 'global_settings' });

        if (!settings) {
            res.status(500);
            throw new Error('Configuración de depósito no disponible.');
        }

        const activeOptions = (settings.depositOptions || [])
            .filter(option => option.isActive)
            .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

        const resolvedOptions = [];

        for (const option of activeOptions) {
            const baseOption = {
                key: option.key,
                id: option.key,
                name: option.name,
                currency: option.currency,
                chain: option.chain || null,
                type: option.type || 'manual',
                address: option.address || null,
                instructions: option.instructions || '',
                minAmount: option.minAmount || 0,
                maxAmount: option.maxAmount || 0,
                displayOrder: option.displayOrder || 0,
            };

                    if ((option.type || 'manual') === 'automatic') {
                        if (!option.chain) {
                            console.warn(`[DepositOptions] Método automático '${option.key}' sin cadena configurada. Se omitirá.`);
                            continue;
                        }

                        if (option.chain === 'BSC') {
                    baseOption.address = await getOrCreateUserBscAddress(userId);
                } else {
                    // Para redes automáticas no soportadas aún, usamos la dirección configurada si existe
                    baseOption.address = option.address || null;
                }
            }

            resolvedOptions.push(baseOption);
        }

        res.json(resolvedOptions);
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