// backend/controllers/treasuryController.js (VERSIÓN FINAL CON PANEL DE CONTROL)
const { ethers } = require('ethers');
const TronWeb = require('tronweb').default.TronWeb;
const User = require('../models/userModel');
const CryptoWallet = require('../models/cryptoWalletModel'); // <-- ¡NUEVA IMPORTACIÓN!
const asyncHandler = require('express-async-handler');

// --- Configuración y Contratos (sin cambios) ---
const bscProvider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY },
});
const USDT_TRON_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDT_BSC_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const usdtBscAbi = ['function balanceOf(address) view returns (uint256)'];
const usdtBscContract = new ethers.Contract(USDT_BSC_ADDRESS, usdtBscAbi, bscProvider);

// getHotWallets y getHotWalletBalances no cambian, pero los envolvemos en asyncHandler
const getHotWallets = () => { /* ... tu código sin cambios ... */ };
const getHotWalletBalances = asyncHandler(async (req, res) => { /* ... tu código sin cambios ... */ });
const sweepWallet = asyncHandler(async (req, res) => { /* ... tu código sin cambios ... */ });

// --- NUEVA FUNCIÓN PARA EL PANEL DE CONTROL ---
/**
 * @desc    Obtener todas las billeteras de depósito con saldo real para barrer
 * @route   GET /api/treasury/sweepable-wallets
 * @access  Private (Admin)
 */
const getSweepableWallets = asyncHandler(async (req, res) => {
    // 1. Obtener todas las billeteras de la base de datos
    const allWallets = await CryptoWallet.find({}).populate('user', 'username');

    // 2. Preparar contratos y consultas
    const usdtTronContract = await tronWeb.contract().at(USDT_TRON_ADDRESS);

    // 3. Crear un array de promesas para consultar todos los saldos en paralelo
    const balancePromises = allWallets.map(async (wallet) => {
        let balances = [];
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

        // Devolver solo si tiene algún saldo
        if (balances.length > 0) {
            return {
                _id: wallet._id,
                address: wallet.address,
                chain: wallet.chain,
                user: wallet.user ? wallet.user.username : 'Usuario Eliminado',
                balances: balances,
            };
        }
        return null; // Devolver null si no hay saldo
    });

    // 4. Ejecutar todas las promesas y filtrar los resultados nulos
    const walletsWithBalance = (await Promise.all(balancePromises)).filter(Boolean);

    res.status(200).json(walletsWithBalance);
});

module.exports = {
    getHotWalletBalances,
    sweepWallet,
    getSweepableWallets, // <-- Exportamos la nueva función
};