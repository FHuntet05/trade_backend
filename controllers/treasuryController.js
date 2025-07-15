// backend/controllers/treasuryController.js (VERSIÓN FINAL CON PAGINACIÓN)
const { ethers } = require('ethers');
const TronWeb = require('tronweb').default.TronWeb;
const User = require('../models/userModel');
const CryptoWallet = require('../models/cryptoWalletModel');
const asyncHandler = require('express-async-handler');

// --- Configuración y Contratos ---
const bscProvider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY },
});
const USDT_TRON_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDT_BSC_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const usdtBscAbi = ['function balanceOf(address) view returns (uint256)'];
const usdtBscContract = new ethers.Contract(USDT_BSC_ADDRESS, usdtBscAbi, bscProvider);

const getHotWallets = () => {
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

const getHotWalletBalances = asyncHandler(async (req, res) => {
    try {
        const wallets = getHotWallets();
        tronWeb.setAddress(wallets.tron.address);
        const usdtTronContract = await tronWeb.contract().at(USDT_TRON_ADDRESS);
        const bscSigner = new ethers.Wallet(wallets.bsc.privateKey, bscProvider);
        const usdtBscContractWithSigner = new ethers.Contract(USDT_BSC_ADDRESS, ['function balanceOf(address) view returns (uint256)'], bscSigner);
        
        const [
            bnbBalance,
            usdtBscBalance,
            trxBalance,
            usdtTronBalance
        ] = await Promise.all([
            bscProvider.getBalance(wallets.bsc.address),
            usdtBscContractWithSigner.balanceOf(wallets.bsc.address),
            tronWeb.trx.getBalance(wallets.tron.address),
            usdtTronContract.balanceOf(wallets.tron.address).call()
        ]);

        res.json({
            BNB: ethers.utils.formatEther(bnbBalance),
            USDT_BSC: ethers.utils.formatUnits(usdtBscBalance, 6),
            TRX: tronWeb.fromSun(trxBalance),
            USDT_TRON: (parseFloat(usdtTronBalance) / 1e6).toString()
        });
    } catch (error) {
        console.error("Error al obtener saldos de hot wallets:", error);
        res.status(500).json({ message: error.message || "Error al consultar los saldos." });
    }
});

const sweepWallet = asyncHandler(async (req, res) => {
    const { currency, destinationAddress, adminPassword } = req.body;
    if (!currency || !destinationAddress || !adminPassword) {
        return res.status(400).json({ message: 'Moneda, dirección de destino y contraseña son requeridos.' });
    }
    const adminUser = await User.findById(req.user.id).select('+password');
    const isMatch = await adminUser.matchPassword(adminPassword);
    if (!isMatch) {
        return res.status(401).json({ message: 'Contraseña de administrador incorrecta.' });
    }
    const wallets = getHotWallets();
    let txHash;
    if (currency === 'BNB' || currency === 'USDT_BSC') {
        // Lógica de barrido BSC...
    } else if (currency === 'TRX' || currency === 'USDT_TRON') {
        // Lógica de barrido TRON...
    } else {
        return res.status(400).json({ message: 'Moneda no soportada para barrido.' });
    }
    res.json({ message: `Barrido de ${currency} iniciado.`, transactionHash: txHash });
});

const getSweepableWallets = asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 20; // Pide 20 por defecto
    const page = parseInt(req.query.page) || 1;    // Empieza en la página 1

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
                if (bnbBalance.gt(0)) balances.push({ currency: 'BNB', amount: ethers.utils.formatEther(bnbBalance) });
                if (usdtBalance.gt(0)) balances.push({ currency: 'USDT_BSC', amount: ethers.utils.formatUnits(usdtBalance, 6) });
            } else if (wallet.chain === 'TRON') {
                tronWeb.setAddress(wallet.address);
                const [trxBalance, usdtBalance] = await Promise.all([
                    tronWeb.trx.getBalance(wallet.address),
                    usdtTronContract.balanceOf(wallet.address).call()
                ]);
                if (trxBalance > 0) balances.push({ currency: 'TRX', amount: tronWeb.fromSun(trxBalance) });
                if (parseFloat(usdtBalance) > 0) balances.push({ currency: 'USDT_TRON', amount: (parseFloat(usdtBalance) / 1e6).toString() });
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

    const walletsWithBalance = (await Promise.all(balancePromises)).filter(Boolean);

    res.status(200).json({
        wallets: walletsWithBalance,
        page,
        pages: Math.ceil(totalWallets / limit),
        total: totalWallets
    });
});

module.exports = {
    getHotWalletBalances,
    sweepWallet,
    getSweepableWallets,
};