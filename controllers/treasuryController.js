// backend/controllers/treasuryController.js (CORREGIDO - Arreglo de TronWeb)

const { ethers } = require('ethers');
const TronWeb = require('tronweb').default.TronWeb;
const User = require('../models/userModel');

// --- Configuración de Redes ---
const bscProvider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY },
});

// ... (direcciones de contratos y getHotWallets no cambian) ...
const USDT_TRON_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDT_BSC_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';

const getHotWallets = () => {
    // Verificación de variable de entorno
    if (!process.env.MASTER_SEED_PHRASE) {
        throw new Error("La variable de entorno MASTER_SEED_PHRASE no está definida.");
    }
    const bscWallet = ethers.Wallet.fromMnemonic(process.env.MASTER_SEED_PHRASE, `m/44'/60'/0'/0/0`);
    const tronWallet = TronWeb.fromMnemonic(process.env.MASTER_SEED_PHRASE, `m/44'/195'/0'/0/0`);
    return {
        bsc: { address: bscWallet.address, privateKey: bscWallet.privateKey },
        tron: { address: tronWallet.address, privateKey: tronWallet.privateKey }
    };
};

/** @desc Obtener los saldos de las hot wallets */
const getHotWalletBalances = async (req, res) => {
    try {
        const wallets = getHotWallets();

        // --- CORRECCIÓN CLAVE ---
        // Establecemos la dirección por defecto para las llamadas de solo lectura en TronWeb.
        tronWeb.setAddress(wallets.tron.address);

        const usdtTronContract = await tronWeb.contract().at(USDT_TRON_ADDRESS);
        const bscSigner = new ethers.Wallet(wallets.bsc.privateKey, bscProvider);
        const usdtBscContract = new ethers.Contract(USDT_BSC_ADDRESS, ['function balanceOf(address) view returns (uint256)'], bscSigner);
        
        const [
            bnbBalance,
            usdtBscBalance,
            trxBalance,
            usdtTronBalance
        ] = await Promise.all([
            bscProvider.getBalance(wallets.bsc.address),
            usdtBscContract.balanceOf(wallets.bsc.address),
            tronWeb.trx.getBalance(wallets.tron.address),
            usdtTronContract.balanceOf(wallets.tron.address).call() // Ahora esta llamada funcionará
        ]);

        res.json({
            BNB: ethers.utils.formatEther(bnbBalance),
            USDT_BSC: ethers.utils.formatUnits(usdtBscBalance, 6),
            TRX: tronWeb.fromSun(trxBalance),
            USDT_TRON: (usdtTronBalance.toNumber() / 1e6).toString()
        });

    } catch (error) {
        console.error("Error al obtener saldos de hot wallets:", error);
        res.status(500).json({ message: error.message || "Error al consultar los saldos." });
    }
};

/** @desc Ejecutar un barrido de una hot wallet */
const sweepWallet = async (req, res) => {
    // ... (la función sweepWallet no necesita cambios, ya configura la private key que es suficiente) ...
    // ... (el resto del archivo es idéntico) ...
};

module.exports = {
    getHotWalletBalances,
    sweepWallet,
};