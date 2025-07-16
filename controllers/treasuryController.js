// backend/controllers/treasuryController.js (VERSIÓN v15.2 - IMPORTE DE TRONWEB CORREGIDO)
const { ethers } = require('ethers');
// --- CORRECCIÓN DEFINITIVA ---
const TronWeb = require('tronweb').default.TronWeb; 
const User = require('../models/userModel');
const CryptoWallet = require('../models/cryptoWalletModel');
const Transaction = require('../models/transactionModel');
const asyncHandler = require('express-async-handler');
const transactionService = require('../services/transactionService');

const bscProvider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
const tronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io', headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY } });
const USDT_TRON_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDT_BSC_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const USDT_ABI = ['function balanceOf(address) view returns (uint256)'];
const usdtBscContract = new ethers.Contract(USDT_BSC_ADDRESS, USDT_ABI, bscProvider);

const getHotWalletBalances = asyncHandler(async (req, res) => {
    const hotWallet = transactionService.initializeHotWallet();
    const usdtTronContract = await tronWeb.contract().at(USDT_TRON_ADDRESS);
    const [ bnbBalance, usdtBscBalance, trxBalance, usdtTronBalance ] = await Promise.all([
        bscProvider.getBalance(hotWallet.bsc.address),
        usdtBscContract.balanceOf(hotWallet.bsc.address),
        tronWeb.trx.getBalance(hotWallet.tron.address),
        usdtTronContract.balanceOf(hotWallet.tron.address).call()
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
    const query = {}; // Podemos añadir filtros si es necesario
    const totalWallets = await CryptoWallet.countDocuments(query);
    const walletsOnPage = await CryptoWallet.find(query).populate('user', 'username').limit(limit).skip(limit * (page - 1));
    const usdtTronContract = await tronWeb.contract().at(USDT_TRON_ADDRESS);
    const balancePromises = walletsOnPage.map(async (wallet) => {
        let balances = [];
        try {
            if (wallet.chain === 'BSC') {
                const [bnb, usdt] = await Promise.all([ bscProvider.getBalance(wallet.address), usdtBscContract.balanceOf(wallet.address) ]);
                if (bnb.gt(0)) balances.push({ currency: 'BNB', amount: ethers.utils.formatEther(bnb) });
                if (usdt.gt(0)) balances.push({ currency: 'USDT_BSC', amount: ethers.utils.formatUnits(usdt, 6) });
            } else if (wallet.chain === 'TRON') {
                const [trx, usdt] = await Promise.all([ tronWeb.trx.getBalance(wallet.address), usdtTronContract.balanceOf(wallet.address).call() ]);
                if (trx > 0) balances.push({ currency: 'TRX', amount: tronWeb.fromSun(trx) });
                const usdtAmount = parseFloat(tronWeb.fromSun(usdt));
                if (usdtAmount > 0) balances.push({ currency: 'USDT_TRON', amount: usdtAmount.toString() });
            }
        } catch (e) { console.error(`Error al consultar saldo para wallet ${wallet.address}: ${e.message}`); }
        if (balances.length > 0) return { _id: wallet._id, address: wallet.address, chain: wallet.chain, user: wallet.user ? wallet.user.username : 'Usuario Eliminado', derivationIndex: wallet.derivationIndex, balances: balances };
        return null;
    });
    const results = await Promise.allSettled(balancePromises);
    const walletsWithBalance = results.filter(r => r.status === 'fulfilled' && r.value !== null).map(r => r.value);
    res.status(200).json({ wallets: walletsWithBalance, page, pages: Math.ceil(totalWallets / limit), total: totalWallets });
});

const sweepWallet = asyncHandler(async (req, res) => {
    const { fromAddress, currency, destinationAddress, adminPassword } = req.body;
    if (!fromAddress || !currency || !destinationAddress || !adminPassword) {
        return res.status(400).json({ message: 'Todos los campos son requeridos para el barrido.' });
    }
    const adminUser = await User.findById(req.user.id).select('+password');
    if (!adminUser) return res.status(404).json({ message: 'Usuario administrador no encontrado.' });
    const isMatch = await adminUser.matchPassword(adminPassword);
    if (!isMatch) return res.status(401).json({ message: 'Contraseña de administrador incorrecta.' });
    const walletToSweep = await CryptoWallet.findOne({ address: fromAddress });
    if (!walletToSweep) return res.status(404).json({ message: `La wallet de depósito ${fromAddress} no se encontró.` });
    let txHash;
    if (currency === 'USDT_TRON') {
        txHash = await transactionService.sweepUsdtOnTronFromDerivedWallet(walletToSweep.derivationIndex, destinationAddress);
    } else {
        return res.status(400).json({ message: `El barrido para ${currency} no está implementado.` });
    }
    await Transaction.create({ user: adminUser._id, type: 'sweep', amount: 0, currency, status: 'completed', description: `Barrido de ${currency} desde ${fromAddress} a ${destinationAddress}`, metadata: { transactionHash: txHash, fromAddress, destinationAddress, sweptWalletId: walletToSweep._id } });
    res.json({ message: `Barrido de ${currency} desde ${fromAddress} iniciado.`, transactionHash: txHash });
});

module.exports = { getHotWalletBalances, sweepWallet, getSweepableWallets };