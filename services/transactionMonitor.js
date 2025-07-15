// backend/services/transactionMonitor.js (MODIFICADO - Stateful con Sincronización en Lotes)
const axios = require('axios');
const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');
const CryptoWallet = require('../models/cryptoWalletModel');
const { ethers } = require('ethers');
const { sendTelegramMessage } = require('./notificationService');
const { getPrice } = require('./priceService');

const USDT_CONTRACT_BSC = '0x55d398326f99059fF775485246999027B3197955';
const USDT_CONTRACT_TRON = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const BSC_API_KEY = process.env.BSCSCAN_API_KEY;
const BATCH_SIZE = 5000; // Escanear en lotes de 5000 bloques
const SYNC_THRESHOLD = 50000; // Si la diferencia es mayor a esto, activa el modo batch

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// processDeposit no cambia, pero es importante que siga aquí
async function processDeposit(tx, wallet, amount, currency, txid) {
    const existingTx = await Transaction.findOne({ 'metadata.txid': txid });
    if (existingTx) return;

    console.log(`[ProcessDeposit] Procesando nuevo depósito: ${amount} ${currency} para usuario ${wallet.user} (TXID: ${txid})`);
    const price = await getPrice(currency);
    if (!price) {
        console.error(`[ProcessDeposit] PRECIO NO ENCONTRADO para ${currency}. Saltando transacción ${txid}.`);
        return;
    }
    const amountInUSDT = amount * price;
    const user = await User.findByIdAndUpdate(wallet.user, { $inc: { 'balance.usdt': amountInUSDT } }, { new: true });
    if (!user) {
        console.error(`[ProcessDeposit] Usuario no encontrado para wallet ${wallet._id}. Abortando depósito.`);
        return;
    }
    await Transaction.create({
        user: wallet.user, type: 'deposit', amount: amountInUSDT, currency: 'USDT',
        description: `Depósito de ${amount.toFixed(6)} ${currency} acreditado como ${amountInUSDT.toFixed(2)} USDT`,
        metadata: {
            txid: txid, chain: wallet.chain, fromAddress: tx.from, toAddress: tx.to,
            originalAmount: amount.toString(), originalCurrency: currency, priceUsed: price.toString(),
            blockNumber: tx.blockNumber,
        }
    });
    console.log(`[ProcessDeposit] ÉXITO: Usuario ${user.username} acreditado con ${amountInUSDT.toFixed(2)} USDT.`);
    if (user.telegramId) {
        const message = `✅ <b>¡Depósito confirmado!</b>\n\nSe han acreditado <b>${amountInUSDT.toFixed(2)} USDT</b> a tu saldo.`;
        await sendTelegramMessage(user.telegramId, message);
    }
}

async function getCurrentBscBlock() {
    try {
        const url = `https://api.bscscan.com/api?module=proxy&action=eth_blockNumber&apikey=${BSC_API_KEY}`;
        const response = await axios.get(url);
        return parseInt(response.data.result, 16);
    } catch (error) {
        console.error("[Monitor BSC] Error obteniendo el bloque actual:", error.message);
        return null;
    }
}

async function scanBlockRange(wallet, startBlock, endBlock) {
    let latestBlockInScan = startBlock;
    try {
        // 1. Escanear transacciones de Tokens BEP-20 (USDT)
        const usdtUrl = `https://api.bscscan.com/api?module=account&action=tokentx&address=${wallet.address}&contractaddress=${USDT_CONTRACT_BSC}&startblock=${startBlock}&endblock=${endBlock}&sort=asc&apikey=${BSC_API_KEY}`;
        const usdtResponse = await axios.get(usdtUrl);
        if (usdtResponse.data.status === '1' && Array.isArray(usdtResponse.data.result)) {
            for (const tx of usdtResponse.data.result) {
                if (tx.to.toLowerCase() === wallet.address.toLowerCase()) {
                    const amount = parseFloat(ethers.utils.formatUnits(tx.value, tx.tokenDecimal));
                    await processDeposit(tx, wallet, amount, 'USDT', tx.hash);
                    latestBlockInScan = Math.max(latestBlockInScan, parseInt(tx.blockNumber));
                }
            }
        }
        await sleep(300); // Pausa entre llamadas a la API

        // 2. Escanear transacciones nativas (BNB)
        const bnbUrl = `https://api.bscscan.com/api?module=account&action=txlist&address=${wallet.address}&startblock=${startBlock}&endblock=${endBlock}&sort=asc&apikey=${BSC_API_KEY}`;
        const bnbResponse = await axios.get(bnbUrl);
        if (bnbResponse.data.status === '1' && Array.isArray(bnbResponse.data.result)) {
            for (const tx of bnbResponse.data.result) {
                if (tx.to.toLowerCase() === wallet.address.toLowerCase() && tx.value !== "0") {
                    const amount = parseFloat(ethers.utils.formatEther(tx.value));
                    await processDeposit(tx, wallet, amount, 'BNB', tx.hash);
                    latestBlockInScan = Math.max(latestBlockInScan, parseInt(tx.blockNumber));
                }
            }
        }
    } catch (error) {
        console.error(`[Monitor BSC] Error escaneando el rango ${startBlock}-${endBlock} para ${wallet.address}:`, error.message);
    }
    return latestBlockInScan;
}

async function checkBscTransactions() {
    console.log("[Monitor BSC] Iniciando ciclo de escaneo STATEFUL para BSC.");
    const wallets = await CryptoWallet.find({ chain: 'BSC' });
    if (wallets.length === 0) return;

    const currentNetworkBlock = await getCurrentBscBlock();
    if (!currentNetworkBlock) {
        console.error("[Monitor BSC] No se pudo obtener el bloque de red actual. Saltando ciclo.");
        return;
    }
    console.log(`[Monitor BSC] Encontradas ${wallets.length} wallets. Bloque de red actual: ${currentNetworkBlock}`);

    for (const wallet of wallets) {
        let lastScanned = wallet.lastScannedBlock;
        const blocksBehind = currentNetworkBlock - lastScanned;

        // --- LÓGICA DE SINCRONIZACIÓN INICIAL / EN LOTES ---
        if (blocksBehind > SYNC_THRESHOLD) {
            console.log(`[Monitor BSC] Sincronización en lotes iniciada para ${wallet.address}. ${blocksBehind} bloques de diferencia.`);
            let fromBlock = lastScanned + 1;
            while (fromBlock < currentNetworkBlock) {
                const toBlock = Math.min(fromBlock + BATCH_SIZE - 1, currentNetworkBlock);
                console.log(`[Monitor BSC] Escaneando lote: ${fromBlock} -> ${toBlock} para wallet ${wallet.address}`);
                
                // No necesitamos el resultado de la función, solo que se ejecute
                await scanBlockRange(wallet, fromBlock, toBlock);
                
                // Guardamos el progreso DESPUÉS de cada lote escaneado
                await CryptoWallet.findByIdAndUpdate(wallet._id, { lastScannedBlock: toBlock });
                console.log(`[Monitor BSC] Wallet ${wallet.address} actualizada al bloque ${toBlock}.`);

                fromBlock = toBlock + 1;
                await sleep(550); // Pausa entre lotes para no saturar la API
            }
            console.log(`[Monitor BSC] Sincronización en lotes completada para ${wallet.address}.`);
        } 
        // --- LÓGICA DE MONITOREO NORMAL ---
        else {
            const startBlock = lastScanned + 1;
            console.log(`[Monitor BSC] Monitoreo normal para ${wallet.address} desde el bloque ${startBlock}`);
            const latestBlockFound = await scanBlockRange(wallet, startBlock, currentNetworkBlock);

            // Actualizamos solo si se encontró un bloque más nuevo.
            if (latestBlockFound > lastScanned) {
                 await CryptoWallet.findByIdAndUpdate(wallet._id, { lastScannedBlock: latestBlockFound });
                 console.log(`[Monitor BSC] Wallet ${wallet.address} actualizada al bloque ${latestBlockFound}.`);
            }
        }
        await sleep(550); // Pausa después de procesar cada wallet
    }
}

// checkTronTransactions no se modifica
async function checkTronTransactions() { /* ... tu código existente ... */ }

const startMonitoring = () => {
  console.log('✅ Iniciando servicio de monitoreo de transacciones COMPLETO (STATEFUL + BATCH SYNC)...');
  const runChecks = async () => {
    await checkBscTransactions();
    await checkTronTransactions();
  };
  
  runChecks();
  setInterval(runChecks, 60000);
};

module.exports = { startMonitoring };