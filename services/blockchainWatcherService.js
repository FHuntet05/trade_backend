// RUTA: backend/services/blockchainWatcherService.js
// VERSIÓN: v35.2 - "Parche Final"
// ESTADO: CORREGIDO PERO OBSOLETO. Este servicio ya no debe ser llamado desde index.js.

const { ethers } = require('ethers');
const TronWeb = require('tronweb');
const axios = require('axios');
const CryptoWallet = require('../models/cryptoWalletModel');
const PendingTx = require('../models/pendingTxModel');
const User = require('../models/userModel');

const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY;
const TRONGRID_API_KEY = process.env.TRONGRID_API_KEY;
const BSC_USDT_CONTRACT_ADDRESS = process.env.BSC_USDT_CONTRACT_ADDRESS || '0x55d398326f99059fF775485246999027B3197955';
const TRON_USDT_CONTRACT_ADDRESS = process.env.TRON_USDT_CONTRACT_ADDRESS || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

const bscProvider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');

const scanAddressForDeposits = async (wallet) => {
    try {
        if (wallet.chain === 'BSC') {
            const apiUrl = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${BSC_USDT_CONTRACT_ADDRESS}&address=${wallet.address}&page=1&offset=50&sort=desc&apikey=${BSCSCAN_API_KEY}`;
            const response = await axios.get(apiUrl);

            if (response.data.status === '1' && response.data.result.length > 0) {
                for (const tx of response.data.result) {
                    if (tx.to.toLowerCase() === wallet.address.toLowerCase()) {
                        const txExists = await PendingTx.findOne({ txHash: tx.hash });
                        if (!txExists) {
                            const amount = parseFloat(ethers.utils.formatUnits(tx.value, 18));
                            console.log(`[Detector OBSOLETO] Nuevo depósito BSC detectado para ${wallet.address}: ${amount} USDT. Hash: ${tx.hash}`);
                            await PendingTx.create({
                                user: wallet.user,
                                chain: 'BSC',
                                txHash: tx.hash,
                                fromAddress: tx.from,
                                toAddress: tx.to,
                                amount: amount,
                                status: 'PENDING',
                                type: 'USDT_DEPOSIT', // Campo 'type' añadido para corregir error de validación.
                            });
                        }
                    }
                }
            }
        } else if (wallet.chain === 'TRON') {
            const apiUrl = `https://api.trongrid.io/v1/accounts/${wallet.address}/transactions/trc20?only_to=true&contract_address=${TRON_USDT_CONTRACT_ADDRESS}&limit=50`;
            const response = await axios.get(apiUrl, { headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY } });

            if (response.data.success && response.data.data.length > 0) {
                for (const tx of response.data.data) {
                     const txExists = await PendingTx.findOne({ txHash: tx.transaction_id });
                     if (!txExists) {
                        if (tx.token_info.symbol === 'USDT' && tx.type === 'Transfer') {
                           const amount = parseFloat(ethers.utils.formatUnits(tx.value, 6));
                           console.log(`[Detector OBSOLETO] Nuevo depósito TRON detectado para ${wallet.address}: ${amount} USDT. Hash: ${tx.transaction_id}`);
                           await PendingTx.create({
                               user: wallet.user,
                               chain: 'TRON',
                               txHash: tx.transaction_id,
                               fromAddress: tx.from,
                               toAddress: tx.to,
                               amount: amount,
                               status: 'PENDING',
                               type: 'USDT_DEPOSIT', // Campo 'type' añadido.
                           });
                        }
                     }
                }
            }
        }
    } catch (error) {
        console.error(`[Detector OBSOLETO] Error al escanear la dirección ${wallet.address} en ${wallet.chain}:`, error.message);
    }
};

const scanForAllWallets = async () => {
    console.log('[Watcher OBSOLETO - Fase 1] Iniciando escaneo de todas las billeteras...');
    const allWallets = await CryptoWallet.find();
    if (allWallets.length === 0) {
        return;
    }
    await Promise.all(allWallets.map(wallet => scanAddressForDeposits(wallet)));
    console.log('[Watcher OBSOLETO - Fase 1] Escaneo de detección completado.');
};

const processTransactions = async () => {
    console.log('[Watcher OBSOLETO - Fase 2/3] Verificando y acreditando...');
    const txsToProcess = await PendingTx.find({ status: { $in: ['PENDING', 'CONFIRMED'] } });

    for (const tx of txsToProcess) {
        try {
            if (tx.status === 'PENDING') {
                let isConfirmed = false;
                if (tx.chain === 'BSC') {
                    const receipt = await bscProvider.getTransactionReceipt(tx.txHash);
                    if (receipt && receipt.status === 1) isConfirmed = true;
                } else if (tx.chain === 'TRON') {
                    const localTronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io', headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY } });
                    const txInfo = await localTronWeb.trx.getTransactionInfo(tx.txHash);
                    if (txInfo && txInfo.receipt && txInfo.receipt.result === 'SUCCESS') isConfirmed = true;
                }

                if (isConfirmed) {
                    tx.status = 'CONFIRMED';
                    console.log(`[Verifier OBSOLETO] Transacción ${tx.txHash} (${tx.chain}) confirmada.`);
                    tx.lastChecked = new Date();
                    await tx.save();
                }

            } else if (tx.status === 'CONFIRMED') {
                const user = await User.findById(tx.user);
                if (user) {
                    // Esta lógica de acreditación es muy simple y fue mejorada en transactionMonitor.js
                    user.balance.usdt = (user.balance.usdt || 0) + Number(tx.amount);
                    await user.save();
                    tx.status = 'CREDITED';
                    await tx.save();
                    console.log(`[Accreditor OBSOLETO] Acreditados ${tx.amount} USDT al usuario ${user._id}.`);
                } else {
                    console.error(`[Accreditor OBSOLETO] ERROR CRÍTICO: No se encontró al usuario con ID ${tx.user} para la tx ${tx.txHash}.`);
                    tx.status = 'ERROR_NO_USER';
                    await tx.save();
                }
            }
        } catch (error) {
            console.error(`[Processor OBSOLETO] Error al procesar tx ${tx.txHash}:`, error.message);
        }
    }
};

const runWatcherCycle = async () => {
    console.log('--- [Watcher OBSOLETO] Iniciando ciclo de operación ---');
    await scanForAllWallets();
    await processTransactions();
    console.log('--- [Watcher OBSOLETO] Ciclo de operación finalizado. ---');
};

const startWatcher = () => {
    const CYCLE_INTERVAL = 60000;
    console.log(`[Watcher OBSOLETO] Servicio de vigilancia listo pero NO INICIADO.`);
    // La llamada a setInterval está comentada para prevenir ejecución accidental si este archivo es importado.
    // runWatcherCycle();
    // setInterval(runWatcherCycle, CYCLE_INTERVAL);
};

module.exports = { startWatcher };