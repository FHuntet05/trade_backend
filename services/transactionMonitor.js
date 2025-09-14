// backend/services/transactionMonitor.js (FASE "REMEDIATIO" - ENFOQUE EXCLUSIVO EN BSC)

const axios = require('axios');
const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');
const CryptoWallet = require('../models/cryptoWalletModel');
const PendingTx = require('../models/pendingTxModel');
const { ethers } = require('ethers');
const { sendTelegramMessage } = require('./notificationService');
const { getPrice } = require('./priceService');
// [REMEDIATIO - REFACTOR] Importamos el servicio centralizado.
const blockchainService = require('./blockchainService');

// --- CONFIGURACIÓN DE CONSTANTES (SOLO BSC) ---
const USDT_CONTRACT_BSC = '0x55d398326f99059fF775485246999027B3197955';
const BUSD_CONTRACT_BSC = '0xe9e7CEA3DedcA5984780Bf86fEE1060eC3d'; // Aún se soporta la detección de depósitos BUSD
const BSC_STABLECOIN_CONTRACTS = [USDT_CONTRACT_BSC.toLowerCase(), BUSD_CONTRACT_BSC.toLowerCase()];
const BSC_API_KEY = process.env.BSCSCAN_API_KEY;
const BATCH_SIZE_BSC = 500;
const SYNC_THRESHOLD_BSC = 5000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function makeHttpRequestWithRetries(url, config = {}, retries = 0) {
    try {
        // [REMEDIATIO - REFACTOR] Usamos el wrapper de caché del blockchainService
        return await blockchainService.makeCachedRequest(url, 15);
    } catch (error) {
        if (retries < MAX_RETRIES) {
            const delay = RETRY_DELAY_MS * Math.pow(2, retries);
            console.warn(`[HTTP_RETRY] Intento ${retries + 1} fallido para ${url}. Reintentando en ${delay / 1000}s. Error: ${error.message}`);
            await sleep(delay);
            return makeHttpRequestWithRetries(url, config, retries + 1);
        } else {
            // Se relanza el error para que el llamador pueda manejarlo si todos los reintentos fallan
            console.error(`[HTTP_RETRY] Fallaron todos los reintentos para ${url}. Error: ${error.message}`);
            throw error;
        }
    }
}

async function processDeposit(tx, wallet, amount, currency, txid, blockIdentifier) {
    const existingTx = await Transaction.findOne({ 'metadata.txid': txid });
    if (existingTx) { return; }

    console.log(`[ProcessDeposit] Procesando nuevo depósito: ${amount} ${currency} para usuario ${wallet.user} (TXID: ${txid})`);
    
    // [REMEDIATIO - LIMPIEZA] Eliminada la lógica de precio para TRX.
    const price = (currency === 'BNB') ? await getPrice(currency) : 1;
    if (!price) {
        console.error(`[ProcessDeposit] PRECIO NO ENCONTRADO para ${currency}. Saltando transacción ${txid}.`);
        return;
    }

    const amountInUSDT = amount * price;
    
    const user = await User.findByIdAndUpdate(
        wallet.user, 
        { $inc: { 'balance.usdt': amountInUSDT, 'totalRecharge': amountInUSDT } }, 
        { new: true }
    );
    
    if (!user) {
        console.error(`[ProcessDeposit] Usuario no encontrado para wallet ${wallet._id}. Abortando depósito.`);
        return;
    }

    const fromAddress = tx.from;
    const toAddress = tx.to;

    await Transaction.create({
        user: wallet.user, type: 'deposit', amount: amountInUSDT, currency: 'USDT',
        description: `Depósito de ${amount.toFixed(6)} ${currency} acreditado como ${amountInUSDT.toFixed(2)} USDT`,
        metadata: {
            txid: txid, chain: wallet.chain, fromAddress: fromAddress, toAddress: toAddress,
            originalAmount: amount.toString(), originalCurrency: currency, priceUsed: price.toString(),
            blockIdentifier: blockIdentifier.toString(),
        }
    });

    console.log(`[ProcessDeposit] ✅ ÉXITO: Usuario ${user.username} acreditado con ${amountInUSDT.toFixed(2)} USDT.`);
    
    if (user.telegramId) {
        const message = `✅ <b>¡Depósito confirmado!</b>\n\nSe han acreditado <b>${amountInUSDT.toFixed(2)} USDT</b> a tu saldo.`;
        await sendTelegramMessage(user.telegramId, message);
    }
}

async function getCurrentBscBlock() {
    try {
        const url = `https://api.bscscan.com/api?module=proxy&action=eth_blockNumber&apikey=${BSC_API_KEY}`;
        const responseData = await blockchainService.makeCachedRequest(url, 5); // Usamos caché de 5s
        if (responseData && responseData.result) {
            return parseInt(responseData.result, 16);
        } else {
            console.error("[Monitor BSC] La respuesta de BscScan no contiene 'result' o es nula.");
            return null;
        }
    } catch (error) {
        console.error(`[Monitor BSC] Excepción al obtener bloque actual: ${error.message}`);
        return null;
    }
}

async function scanBscBlockRange(wallet, startBlock, endBlock) {
    try {
        console.log(`[Monitor BSC] Escaneando ${wallet.address} de ${startBlock} a ${endBlock}`);
        
        const allTokenTxUrl = `https://api.bscscan.com/api?module=account&action=tokentx&address=${wallet.address}&startblock=${startBlock}&endblock=${endBlock}&sort=asc&apikey=${BSC_API_KEY}`;
        const allTokenTxResponse = await makeHttpRequestWithRetries(allTokenTxUrl);
        
        if (allTokenTxResponse.status === '1' && Array.isArray(allTokenTxResponse.result)) {
            for (const tx of allTokenTxResponse.result) {
                const txContractAddressLower = tx.contractAddress ? tx.contractAddress.toLowerCase() : null;
                if (tx.to.toLowerCase() === wallet.address.toLowerCase() && BSC_STABLECOIN_CONTRACTS.includes(txContractAddressLower)) {
                    const amount = parseFloat(ethers.utils.formatUnits(tx.value, tx.tokenDecimal));
                    const originalCurrency = txContractAddressLower === USDT_CONTRACT_BSC.toLowerCase() ? 'USDT' : 'BUSD';
                    await processDeposit(tx, wallet, amount, originalCurrency, tx.hash, tx.blockNumber);
                }
            }
        }
        await sleep(300);

        const bnbUrl = `https://api.bscscan.com/api?module=account&action=txlist&address=${wallet.address}&startblock=${startBlock}&endblock=${endBlock}&sort=asc&apikey=${BSC_API_KEY}`;
        const bnbResponse = await makeHttpRequestWithRetries(bnbUrl);

        if (bnbResponse.status === '1' && Array.isArray(bnbResponse.result)) {
            for (const tx of bnbResponse.result) {
                if (tx.to.toLowerCase() === wallet.address.toLowerCase() && tx.value !== "0") {
                    const amount = parseFloat(ethers.utils.formatEther(tx.value));
                    await processDeposit(tx, wallet, amount, 'BNB', tx.hash, tx.blockNumber);
                }
            }
        }
    } catch (error) {
        console.error(`[Monitor BSC] EXCEPCIÓN al escanear rango ${startBlock}-${endBlock} para ${wallet.address}: ${error.message}`);
    }
}

async function checkBscTransactions() {
    console.log("[Monitor BSC] Iniciando ciclo de escaneo para BSC.");
    const wallets = await CryptoWallet.find({ chain: 'BSC' });
    if (wallets.length === 0) {
        console.log("[Monitor BSC] No hay billeteras BSC para escanear.");
        return;
    }

    const currentNetworkBlock = await getCurrentBscBlock();
    if (!currentNetworkBlock) {
        console.error("[Monitor BSC] No se pudo obtener el bloque actual de la red. Saltando ciclo.");
        return;
    }
    console.log(`[Monitor BSC] Encontradas ${wallets.length} wallets. Bloque de red actual: ${currentNetworkBlock}`);

    for (const wallet of wallets) {
        let lastScanned = wallet.lastScannedBlock || 0; 
        const blocksBehind = currentNetworkBlock - lastScanned;

        if (blocksBehind > SYNC_THRESHOLD_BSC) {
            console.log(`[Monitor BSC] Sincronización en lotes para ${wallet.address}. ${blocksBehind} bloques de diferencia.`);
            let fromBlock = lastScanned + 1;
            while (fromBlock < currentNetworkBlock) {
                const toBlock = Math.min(fromBlock + BATCH_SIZE_BSC - 1, currentNetworkBlock);
                await scanBscBlockRange(wallet, fromBlock, toBlock);
                await CryptoWallet.findByIdAndUpdate(wallet._id, { lastScannedBlock: toBlock });
                fromBlock = toBlock + 1;
                await sleep(550);
            }
        } else if (blocksBehind > 0) {
            const startBlock = lastScanned + 1;
            await scanBscBlockRange(wallet, startBlock, currentNetworkBlock);
        }

        await CryptoWallet.findByIdAndUpdate(wallet._id, { lastScannedBlock: currentNetworkBlock });
        await sleep(550);
    }
}

async function processPendingTransactionsStatus() {
    const pendingTxs = await PendingTx.find({ status: 'PENDING', chain: 'BSC' });
    if (pendingTxs.length === 0) { return; }
    
    console.log(`[Monitor PendingTx] Verificando ${pendingTxs.length} transacciones BSC con estado PENDING...`);
    for (const tx of pendingTxs) {
        try {
            let isConfirmed = false;
            let txFailed = false;

            const receipt = await blockchainService.provider.getTransactionReceipt(tx.txHash);
            if (receipt) {
                if (receipt.status === 1) isConfirmed = true;
                if (receipt.status === 0) txFailed = true;
            }

            if (isConfirmed) {
                tx.status = 'CONFIRMED';
                console.log(`[Monitor PendingTx] ✅ Transacción ${tx.txHash} (BSC) CONFIRMADA.`);
            } else if (txFailed) {
                 tx.status = 'FAILED';
                 console.log(`[Monitor PendingTx] ❌ Transacción ${tx.txHash} (BSC) FALLIDA.`);
            }
            tx.lastChecked = new Date();
            await tx.save();

        } catch (error) {
            console.error(`[Monitor PendingTx] Error al verificar tx ${tx.txHash}:`, error.message);
        }
        await sleep(200);
    }
}

const startMonitoring = () => {
  console.log('✅ Iniciando servicio de monitoreo de transacciones (SOLO BSC)...');
  const runChecks = async () => {
    console.log("--- [Monitor] Iniciando ciclo de monitoreo BSC ---");
    // [REMEDIATIO - LIMPIEZA] Eliminada la llamada a checkTronTransactions
    await Promise.all([
        checkBscTransactions(),
        processPendingTransactionsStatus() 
    ]);
    console.log("--- [Monitor] Ciclo de monitoreo BSC finalizado. Esperando al siguiente. ---");
  };
  runChecks();
  setInterval(runChecks, 60000); 
};

module.exports = { startMonitoring };