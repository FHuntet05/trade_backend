// RUTA: backend/services/blockchainWatcherService.js (VERSIÓN "NEXUS - SERVERLESS COMPATIBLE")

const axios = require('axios');
const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');
const CryptoWallet = require('../models/cryptoWalletModel');
const { ethers } = require('ethers');
const { sendTelegramMessage } = require('./notificationService');
const { getPrice } = require('./priceService');

// --- CONFIGURACIÓN DE CONSTANTES ---
const USDT_CONTRACT_BSC = '0x55d398326f99059fF775485246999027B3197955';
const BUSD_CONTRACT_BSC = '0xe9e7CEA3DedcA5984780Bf86fEE1060eC3d';
const BSC_STABLECOIN_CONTRACTS = [
    USDT_CONTRACT_BSC.toLowerCase(),
    BUSD_CONTRACT_BSC.toLowerCase()
];
const TRON_USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

const BSC_API_KEY = process.env.BSCSCAN_API_KEY;
const TRON_API_KEY = process.env.TRONGRID_API_KEY;

const BATCH_SIZE_BSC = 5000;
const SYNC_THRESHOLD_BSC = 500000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function processDeposit(tx, wallet, amount, currency, txid, blockIdentifier) {
    const existingTx = await Transaction.findOne({ 'metadata.txid': txid });
    if (existingTx) {
        return;
    }
    console.log(`[ProcessDeposit] Procesando nuevo depósito: ${amount} ${currency} para usuario ${wallet.user} (TXID: ${txid})`);
    const price = (currency === 'BNB' || currency === 'TRX') ? await getPrice(currency) : 1;
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
    const fromAddress = tx.from || (tx.owner_address);
    const toAddress = tx.to || (tx.transfer_to_address);
    await Transaction.create({
        user: wallet.user, type: 'deposit', amount: amountInUSDT, currency: 'USDT',
        description: `Depósito de ${amount.toFixed(6)} ${currency} acreditado como ${amountInUSDT.toFixed(2)} USDT`,
        metadata: {
            txid: txid, chain: wallet.chain, fromAddress: fromAddress, toAddress: toAddress,
            originalAmount: amount.toString(), originalCurrency: currency, priceUsed: price.toString(),
            blockIdentifier: blockIdentifier.toString(),
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
        const response = await axios.get(url, { timeout: 10000 });
        if (response.data && response.data.result) {
            return parseInt(response.data.result, 16);
        }
        console.error("[Monitor BSC] La respuesta de BscScan no contiene 'result'.");
        return null;
    } catch (error) {
        console.error(`[Monitor BSC] Excepción al obtener bloque actual: ${error.message}`);
        return null;
    }
}

async function scanBscBlockRange(wallet, startBlock, endBlock) {
    let latestBlockInScan = startBlock;
    try {
        const allTokenTxUrl = `https://api.bscscan.com/api?module=account&action=tokentx&address=${wallet.address}&startblock=${startBlock}&endblock=${endBlock}&sort=asc&apikey=${BSC_API_KEY}`;
        const allTokenTxResponse = await axios.get(allTokenTxUrl, { timeout: 15000 });
        if (allTokenTxResponse.data.status === '1' && Array.isArray(allTokenTxResponse.data.result)) {
            for (const tx of allTokenTxResponse.data.result) {
                const txContractAddressLower = tx.contractAddress ? tx.contractAddress.toLowerCase() : null;
                if (tx.to.toLowerCase() === wallet.address.toLowerCase() && BSC_STABLECOIN_CONTRACTS.includes(txContractAddressLower)) {
                    const amount = parseFloat(ethers.utils.formatUnits(tx.value, tx.tokenDecimal));
                    const originalCurrency = txContractAddressLower === USDT_CONTRACT_BSC.toLowerCase() ? 'USDT' : 'BUSD';
                    await processDeposit(tx, wallet, amount, originalCurrency, tx.hash, tx.blockNumber);
                    latestBlockInScan = Math.max(latestBlockInScan, parseInt(tx.blockNumber));
                }
            }
        }
        await sleep(300);
        const bnbUrl = `https://api.bscscan.com/api?module=account&action=txlist&address=${wallet.address}&startblock=${startBlock}&endblock=${endBlock}&sort=asc&apikey=${BSC_API_KEY}`;
        const bnbResponse = await axios.get(bnbUrl, { timeout: 15000 });
        if (bnbResponse.data.status === '1' && Array.isArray(bnbResponse.data.result)) {
            for (const tx of bnbResponse.data.result) {
                if (tx.to.toLowerCase() === wallet.address.toLowerCase() && tx.value !== "0") {
                    const amount = parseFloat(ethers.utils.formatEther(tx.value));
                    await processDeposit(tx, wallet, amount, 'BNB', tx.hash, tx.blockNumber);
                    latestBlockInScan = Math.max(latestBlockInScan, parseInt(tx.blockNumber));
                }
            }
        }
    } catch (error) {
        console.error(`[Monitor BSC] EXCEPCIÓN al escanear rango ${startBlock}-${endBlock} para ${wallet.address}: ${error.message}`);
    }
    return latestBlockInScan;
}

async function checkBscTransactions() {
    console.log("[Monitor BSC] Iniciando ciclo de escaneo STATEFUL para BSC.");
    const wallets = await CryptoWallet.find({ chain: 'BSC' });
    if (wallets.length === 0) {
        console.log("[Monitor BSC] No hay billeteras BSC para escanear.");
        return;
    }
    const currentNetworkBlock = await getCurrentBscBlock();
    if (!currentNetworkBlock) {
        console.error("[Monitor BSC] No se pudo obtener el bloque de red actual. Saltando ciclo.");
        return;
    }
    for (const wallet of wallets) {
        let lastScanned = wallet.lastScannedBlock || 0;
        const blocksBehind = currentNetworkBlock - lastScanned;
        if (blocksBehind > SYNC_THRESHOLD_BSC) {
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
            const latestBlockFound = await scanBscBlockRange(wallet, startBlock, currentNetworkBlock);
            await CryptoWallet.findByIdAndUpdate(wallet._id, { lastScannedBlock: Math.max(latestBlockFound, currentNetworkBlock) });
        }
    }
}

async function scanTronAddress(wallet) {
    const minTimestamp = wallet.lastScannedTimestamp ? wallet.lastScannedTimestamp + 1 : 0;
    let latestTimestampInScan = wallet.lastScannedTimestamp || 0;
    try {
        const usdtUrl = `https://api.trongrid.io/v1/accounts/${wallet.address}/transactions/trc20?only_to=true&min_timestamp=${minTimestamp}&contract_address=${TRON_USDT_CONTRACT}&limit=200`;
        const usdtResponse = await axios.get(usdtUrl, { timeout: 15000 });
        if (usdtResponse.data.success && Array.isArray(usdtResponse.data.data)) {
            for (const tx of usdtResponse.data.data) {
                const amount = parseFloat(ethers.utils.formatUnits(tx.value, tx.token_info.decimals || 6));
                await processDeposit(tx, wallet, amount, 'USDT', tx.transaction_id, tx.block_timestamp);
                latestTimestampInScan = Math.max(latestTimestampInScan, tx.block_timestamp);
            }
        }
        await sleep(300);
        const trxUrl = `https://api.trongrid.io/v1/accounts/${wallet.address}/transactions?only_to=true&min_timestamp=${minTimestamp}&limit=200`;
        const trxResponse = await axios.get(trxUrl, { timeout: 15000 });
        if (trxResponse.data.success && Array.isArray(trxResponse.data.data)) {
            for (const tx of trxResponse.data.data) {
                if (tx.raw_data.contract[0].type === 'TransferContract' && tx.ret[0].contractRet === 'SUCCESS') {
                    const transferData = tx.raw_data.contract[0].parameter.value;
                    if (transferData.amount > 0) {
                        const amount = parseFloat(ethers.utils.formatUnits(transferData.amount, 6));
                        await processDeposit(transferData, wallet, amount, 'TRX', tx.txID, tx.block_timestamp);
                        latestTimestampInScan = Math.max(latestTimestampInScan, tx.block_timestamp);
                    }
                }
            }
        }
    } catch (error) {
        console.error(`[Monitor TRON] Error escaneando ${wallet.address}:`, error.response ? error.response.data : error.message);
    }
    if (latestTimestampInScan > (wallet.lastScannedTimestamp || 0)) {
        await CryptoWallet.findByIdAndUpdate(wallet._id, { lastScannedTimestamp: latestTimestampInScan });
    }
}

async function checkTronTransactions() {
    const wallets = await CryptoWallet.find({ chain: 'TRON' });
    for (const wallet of wallets) {
        await scanTronAddress(wallet);
        await sleep(550);
    }
}

// --- INICIO DE LA CORRECCIÓN CRÍTICA ---

/**
 * Nueva función que ejecuta un único ciclo de monitoreo para ambas blockchains.
 * Esta función está diseñada para ser llamada por un Vercel Cron Job.
 * Hará su trabajo y terminará, permitiendo que la función serverless finalice correctamente.
 */
const runBlockchainMonitoringCycle = async () => {
  console.log("--- [CRON CYCLE] Iniciando ciclo de monitoreo de ambas cadenas ---");
  // Se ejecutan en paralelo para mayor eficiencia
  await Promise.all([
      checkBscTransactions(),
      checkTronTransactions()
  ]);
  console.log("--- [CRON CYCLE] Ciclo de monitoreo finalizado. ---");
};

/**
 * La función original 'startMonitoring' se mantiene para desarrollo local.
 * Ahora simplemente llama a la nueva función de ciclo único dentro de su 'setInterval'.
 * ESTA FUNCIÓN NO DEBE SER LLAMADA EN PRODUCCIÓN (VERCEL).
 */
const startMonitoring = () => {
  console.log('✅ Iniciando servicio de monitoreo local (setInterval)...');
  
  // Ejecutar una vez al inicio
  runBlockchainMonitoringCycle();

  // Programar ejecuciones posteriores
  setInterval(runBlockchainMonitoringCycle, 60000); 
};

// Se exporta la nueva función para que 'cronRoutes.js' pueda usarla.
module.exports = { 
    startMonitoring,
    runBlockchainMonitoringCycle 
};
// --- FIN DE LA CORRECCIÓN CRÍTICA ---