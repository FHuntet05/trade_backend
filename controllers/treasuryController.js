// backend/controllers/treasuryController.js (FASE "REMEDIATIO" - ENFOQUE EXCLUSIVO EN BSC)
const { ethers } = require('ethers');
const User = require('../models/userModel');
const CryptoWallet = require('../models/cryptoWalletModel');
const Transaction = require('../models/transactionModel');
const asyncHandler = require('express-async-handler');
const transactionService = require('../services/transactionService');
const mongoose = require('mongoose');
// [REMEDIATIO - REFACTOR] Importamos el servicio centralizado.
const blockchainService = require('../services/blockchainService');

// [REMEDIATIO - LIMPIEZA] Eliminadas constantes y inicializaciones de TRON.
const USDT_BSC_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const USDT_ABI = ['function balanceOf(address) view returns (uint256)'];
// [REMEDIATIO - REFACTOR] Usamos el proveedor central para crear el contrato de solo lectura.
const usdtBscContract = new ethers.Contract(USDT_BSC_ADDRESS, USDT_ABI, blockchainService.provider);

function promiseWithTimeout(promise, ms, timeoutMessage = 'Operación excedió el tiempo de espera.') {
    const timeout = new Promise((_, reject) => {
        const id = setTimeout(() => { clearTimeout(id); reject(new Error(timeoutMessage)); }, ms);
    });
    return Promise.race([promise, timeout]);
}

async function registerDeposit(wallet, amount, currency) {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        const numericAmount = parseFloat(amount);
        const txIdentifier = `${wallet.address}-${numericAmount.toFixed(8)}-${currency}`;
        const existingTx = await Transaction.findOne({ 'metadata.identifier': txIdentifier }).session(session);
        if (!existingTx) {
            const newTx = new Transaction({
                user: wallet.user, type: 'deposit', currency: currency, amount: numericAmount,
                status: 'completed', description: `Depósito detectado en ${wallet.chain} wallet`,
                metadata: { walletAddress: wallet.address, identifier: txIdentifier },
            });
            await newTx.save({ session });
            await User.updateOne({ _id: wallet.user }, { $inc: { 'balance.usdt': numericAmount } }).session(session);
            console.log(`Depósito de ${amount} ${currency} registrado para usuario con ID ${wallet.user}`);
        }
        await session.commitTransaction();
    } catch (e) {
        await session.abortTransaction();
        console.error(`Error al registrar depósito para wallet ${wallet.address}: ${e.message}`);
    } finally {
        session.endSession();
    }
}

const getSweepableWallets = asyncHandler(async (req, res) => {
    console.log('[Treasury] Iniciando escaneo de wallets BSC en tiempo real...');
    // [REMEDIATIO - LIMPIEZA] Buscamos solo wallets BSC.
    const allWallets = await CryptoWallet.find({ chain: 'BSC' }).populate('user', '_id').lean();
    
    const scanPromises = allWallets.map(async (wallet) => {
        let detectedBalances = [];
        if (!wallet.user) return;
        try {
            const usdtBalanceRaw = await promiseWithTimeout(usdtBscContract.balanceOf(wallet.address), 15000);
            if (usdtBalanceRaw.gt(0)) {
                const usdtAmount = ethers.utils.formatUnits(usdtBalanceRaw, 18);
                detectedBalances.push({ currency: 'USDT_BSC', amount: usdtAmount });
                await registerDeposit(wallet, usdtAmount, 'USDT_BSC');
            }
        } catch(e) {
            console.error(`[Treasury] Error escaneando wallet ${wallet.address}: ${e.message}`);
        }
        await CryptoWallet.updateOne({ _id: wallet._id }, { $set: { balances: detectedBalances } });
    });

    await Promise.all(scanPromises);
    console.log('[Treasury] Escaneo de wallets BSC completado.');

    const limit = parseInt(req.query.limit) || 20;
    const page = parseInt(req.query.page) || 1;
    const filter = { 'balances.0': { '$exists': true }, chain: 'BSC' };

    const totalWalletsWithBalance = await CryptoWallet.countDocuments(filter);
    const walletsToReturn = await CryptoWallet.find(filter)
        .populate('user', 'username')
        .limit(limit)
        .skip(limit * (page - 1))
        .lean();

    res.status(200).json({ 
        wallets: walletsToReturn, 
        page, 
        pages: Math.ceil(totalWalletsWithBalance / limit), 
        total: totalWalletsWithBalance 
    });
});

const getHotWalletBalances = asyncHandler(async (req, res) => {
    // [REMEDIATIO - LIMPIEZA] Solo obtenemos los balances de la wallet central de BSC.
    const { bscWallet } = transactionService.getCentralWallets();
    
    const [ bnbBalance, usdtBscBalance ] = await Promise.all([
        promiseWithTimeout(blockchainService.provider.getBalance(bscWallet.address), 10000),
        promiseWithTimeout(usdtBscContract.balanceOf(bscWallet.address), 10000),
    ]);
    
    res.json({
        BNB: ethers.utils.formatEther(bnbBalance),
        USDT_BSC: ethers.utils.formatUnits(usdtBscBalance, 18),
    });
});

const sweepWallet = asyncHandler(async (req, res) => {
    const { fromAddress, currency, destinationAddress, adminPassword } = req.body;
    if (!fromAddress || !currency || !destinationAddress || !adminPassword) {
        return res.status(400).json({ message: 'Todos los campos son requeridos para el barrido.' });
    }
    // [REMEDIATIO - LIMPIEZA] Nos aseguramos de que solo se pueda barrer USDT_BSC.
    if (currency !== 'USDT_BSC') {
        return res.status(400).json({ message: `El barrido para ${currency} no está implementado.` });
    }

    const adminUser = await User.findById(req.user.id).select('+password');
    if (!adminUser || !(await adminUser.matchPassword(adminPassword))) {
        return res.status(401).json({ message: 'Credenciales de administrador incorrectas.' });
    }
    const walletToSweep = await CryptoWallet.findOne({ address: fromAddress });
    if (!walletToSweep) return res.status(404).json({ message: `La wallet de depósito ${fromAddress} no se encontró.` });
    
    const txHash = await transactionService.sweepUsdtOnBscFromDerivedWallet(walletToSweep.derivationIndex, destinationAddress);
    
    await CryptoWallet.updateOne({ _id: walletToSweep._id }, { $set: { balances: [] } });

    await Transaction.create({ 
        user: adminUser._id, type: 'sweep', amount: 0, currency: currency, status: 'completed', 
        description: `Barrido de ${currency} desde ${fromAddress} a ${destinationAddress}`, 
        metadata: { transactionHash: txHash, fromAddress, destinationAddress, sweptWalletId: walletToSweep._id.toString() } 
    });
    res.json({ message: `Barrido de ${currency} desde ${fromAddress} iniciado.`, transactionHash: txHash });
});

module.exports = { getHotWalletBalances, sweepWallet, getSweepableWallets };