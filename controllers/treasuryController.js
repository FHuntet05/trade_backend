// backend/controllers/treasuryController.js (VERSIÓN v15.0.2 - IMPORTE RESTAURADO)
const { ethers } = require('ethers');
// <-- CORRECCIÓN DEFINITIVA: Restaurada la línea de importación original que funcionaba.
const TronWeb = require('tronweb').default.TronWeb; 
const User = require('../models/userModel');
const CryptoWallet = require('../models/cryptoWalletModel');
const asyncHandler = require('express-async-handler');

// --- Configuración y Constantes ---
const bscProvider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY },
});

const USDT_TRON_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDT_BSC_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const USDT_ABI = ['function balanceOf(address) view returns (uint256)'];
const usdtBscContract = new ethers.Contract(USDT_BSC_ADDRESS, USDT_ABI, bscProvider);

// --- Funciones de Utilidad ---
const getHotWallets = () => {
    if (!process.env.MASTER_SEED_PHRASE) {
        console.error("CRITICAL: MASTER_SEED_PHRASE no está definida.");
        throw new Error("La variable de entorno MASTER_SEED_PHRASE no está definida.");
    }
    const bscWallet = ethers.Wallet.fromMnemonic(process.env.MASTER_SEED_PHRASE, `m/44'/60'/0'/0/0`);
    // NOTA: TronWeb.fromMnemonic no existe en todas las versiones, esto depende de la tuya.
    // Si esta línea falla, la restauraremos a la versión original que usaba `TronWeb.fromMnemonic`
    const tronMnemonicWallet = TronWeb.fromMnemonic(process.env.MASTER_SEED_PHRASE, `m/44'/195'/0'/0/0`);
    return {
        bsc: { address: bscWallet.address, privateKey: bscWallet.privateKey },
        tron: { address: tronMnemonicWallet.address, privateKey: tronMnemonicWallet.privateKey }
    };
};

// --- Controladores ---
const getHotWalletBalances = asyncHandler(async (req, res) => {
    const wallets = getHotWallets();
    const usdtTronContract = await tronWeb.contract().at(USDT_TRON_ADDRESS);

    const [
        bnbBalance,
        usdtBscBalance,
        trxBalance,
        usdtTronBalance
    ] = await Promise.all([
        bscProvider.getBalance(wallets.bsc.address),
        usdtBscContract.balanceOf(wallets.bsc.address),
        tronWeb.trx.getBalance(wallets.tron.address),
        usdtTronContract.balanceOf(wallets.tron.address).call()
    ]);

    res.json({
        BNB: ethers.utils.formatEther(bnbBalance),
        USDT_BSC: ethers.utils.formatUnits(usdtBscBalance, 6),
        TRX: tronWeb.fromSun(trxBalance),
        USDT_TRON: tronWeb.fromSun(usdtTronBalance)
    });
});

const getSweepableWallets = asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const page = parseInt(req.query.page) || 1;

    const totalWallets = await CryptoWallet.countDocuments({});
    const walletsOnPage = await CryptoWallet.find({})
        .populate('user', 'username')
        .limit(limit)
        .skip(limit * (page - 1));

    const usdtTronContract = await tronWeb.contract().at(USDT_TRON_ADDRESS);

    const balancePromises = walletsOnPage.map(async (wallet) => {
        let balances = [];
        try {
            if (wallet.chain === 'BSC') {
                const [bnbBalance, usdtBalance] = await Promise.all([
                    bscProvider.getBalance(wallet.address),
                    usdtBscContract.balanceOf(wallet.address)
                ]);
                if (bnbBalance.gt(0)) {
                    balances.push({ currency: 'BNB', amount: ethers.utils.formatEther(bnbBalance) });
                }
                if (usdtBalance.gt(0)) {
                    balances.push({ currency: 'USDT_BSC', amount: ethers.utils.formatUnits(usdtBalance, 6) });
                }
            } else if (wallet.chain === 'TRON') {
                const [trxBalance, usdtBalance] = await Promise.all([
                    tronWeb.trx.getBalance(wallet.address),
                    usdtTronContract.balanceOf(wallet.address).call()
                ]);
                if (trxBalance > 0) {
                    balances.push({ currency: 'TRX', amount: tronWeb.fromSun(trxBalance) });
                }
                const usdtAmount = parseFloat(tronWeb.fromSun(usdtBalance));
                if (usdtAmount > 0) {
                    balances.push({ currency: 'USDT_TRON', amount: usdtAmount.toString() });
                }
            }
        } catch (e) {
            console.error(`Error al consultar saldo para wallet ${wallet.address}: ${e.message}`);
        }
        
        if (balances.length > 0) {
            return {
                _id: wallet._id,
                address: wallet.address,
                chain: wallet.chain,
                user: wallet.user ? wallet.user.username : 'Usuario Eliminado',
                balances: balances,
            };
        }
        return null;
    });

    const results = await Promise.allSettled(balancePromises);
    const walletsWithBalance = results
        .filter(result => result.status === 'fulfilled' && result.value !== null)
        .map(result => result.value);

    res.status(200).json({
        wallets: walletsWithBalance,
        page,
        pages: Math.ceil(totalWallets / limit),
        total: totalWallets
    });
});

const sweepWallet = asyncHandler(async (req, res) => {
    const { currency, destinationAddress, adminPassword } = req.body;
    if (!currency || !destinationAddress || !adminPassword) {
        return res.status(400).json({ message: 'Moneda, dirección de destino y contraseña son requeridos.' });
    }
    const adminUser = await User.findById(req.user.id).select('+password');
    if(!adminUser) {
        return res.status(404).json({ message: 'Usuario administrador no encontrado.' });
    }
    const isMatch = await adminUser.matchPassword(adminPassword);
    if (!isMatch) {
        return res.status(401).json({ message: 'Contraseña de administrador incorrecta.' });
    }
    const wallets = getHotWallets();
    let txHash = 'No implementado aún';
    
    if (currency === 'BNB' || currency === 'USDT_BSC') {
        console.warn(`Intento de barrido para ${currency} no implementado.`);
    } else if (currency === 'TRX' || currency === 'USDT_TRON') {
        console.warn(`Intento de barrido para ${currency} no implementado.`);
    } else {
        return res.status(400).json({ message: 'Moneda no soportada para barrido.' });
    }
    res.json({ message: `Barrido de ${currency} iniciado (simulado).`, transactionHash: txHash });
});


module.exports = {
    getHotWalletBalances,
    sweepWallet,
    getSweepableWallets,
};