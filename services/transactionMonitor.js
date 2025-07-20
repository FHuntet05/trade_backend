// backend/services/transactionMonitor.js (RECONSTRUIDO v35.1 - MONITOREO TRON RESTAURADO)
const axios = require('axios');
const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');
const CryptoWallet = require('../models/cryptoWalletModel');
const { ethers } = require('ethers');
const { sendTelegramMessage } = require('./notificationService');
const { getPrice } = require('./priceService');

// --- CONFIGURACIÓN DE CONSTANTES ---
const USDT_CONTRACT_BSC = '0x55d398326f99059fF775485246999027B3197955';
const USDT_CONTRACT_TRON = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const BSC_API_KEY = process.env.BSCSCAN_API_KEY;
const TRON_API_KEY = process.env.TRONGRID_API_KEY;

// --- CONFIGURACIÓN DE SINCRONIZACIÓN (BSC) ---
const BATCH_SIZE_BSC = 5000; // Escanear en lotes de 5000 bloques
const SYNC_THRESHOLD_BSC = 50000; // Si la diferencia es mayor a esto, activa el modo batch

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Procesa un depósito detectado, lo registra y actualiza el saldo del usuario.
 * Esta función es agnóstica a la cadena y es llamada tanto por el monitor de BSC como el de TRON.
 * @param {object} tx - El objeto de la transacción de la API del explorador.
 * @param {object} wallet - El documento de CryptoWallet de nuestra DB.
 * @param {number} amount - La cantidad de la criptomoneda depositada.
 * @param {string} currency - El símbolo de la criptomoneda ('USDT', 'BNB', 'TRX').
 * @param {string} txid - El hash/ID de la transacción.
 * @param {number|string} blockIdentifier - El número de bloque (BSC) o timestamp (TRON) de la tx.
 */
async function processDeposit(tx, wallet, amount, currency, txid, blockIdentifier) {
    const existingTx = await Transaction.findOne({ 'metadata.txid': txid });
    if (existingTx) {
        // console.log(`[ProcessDeposit] Depósito ya procesado: ${txid}. Saltando.`);
        return;
    }

    console.log(`[ProcessDeposit] Procesando nuevo depósito: ${amount} ${currency} para usuario ${wallet.user} (TXID: ${txid})`);
    
    // El precio del USDT es siempre 1. Para BNB/TRX, lo obtenemos de la base de datos.
    const price = currency === 'USDT' ? 1 : await getPrice(currency);
    
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
        user: wallet.user,
        type: 'deposit',
        amount: amountInUSDT,
        currency: 'USDT',
        description: `Depósito de ${amount.toFixed(6)} ${currency} acreditado como ${amountInUSDT.toFixed(2)} USDT`,
        metadata: {
            txid: txid,
            chain: wallet.chain,
            fromAddress: fromAddress,
            toAddress: toAddress,
            originalAmount: amount.toString(),
            originalCurrency: currency,
            priceUsed: price.toString(),
            blockIdentifier: blockIdentifier.toString(),
        }
    });

    console.log(`[ProcessDeposit] ÉXITO: Usuario ${user.username} acreditado con ${amountInUSDT.toFixed(2)} USDT.`);
    
    if (user.telegramId) {
        const message = `✅ <b>¡Depósito confirmado!</b>\n\nSe han acreditado <b>${amountInUSDT.toFixed(2)} USDT</b> a tu saldo.`;
        await sendTelegramMessage(user.telegramId, message);
    }
}

// =====================================================================================
// ========================== MONITOR DE LA RED BSC (SIN CAMBIOS) ======================
// =====================================================================================

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

async function scanBscBlockRange(wallet, startBlock, endBlock) {
    let latestBlockInScan = startBlock;
    try {
        // 1. Escanear transacciones de Tokens BEP-20 (USDT)
        const usdtUrl = `https://api.bscscan.com/api?module=account&action=tokentx&address=${wallet.address}&contractaddress=${USDT_CONTRACT_BSC}&startblock=${startBlock}&endblock=${endBlock}&sort=asc&apikey=${BSC_API_KEY}`;
        const usdtResponse = await axios.get(usdtUrl);
        if (usdtResponse.data.status === '1' && Array.isArray(usdtResponse.data.result)) {
            for (const tx of usdtResponse.data.result) {
                if (tx.to.toLowerCase() === wallet.address.toLowerCase()) {
                    const amount = parseFloat(ethers.utils.formatUnits(tx.value, tx.tokenDecimal));
                    await processDeposit(tx, wallet, amount, 'USDT', tx.hash, tx.blockNumber);
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
                    await processDeposit(tx, wallet, amount, 'BNB', tx.hash, tx.blockNumber);
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
    
    for (const wallet of wallets) {
        let lastScanned = wallet.lastScannedBlock || (currentNetworkBlock - 1); // Si nunca se ha escaneado, empieza desde el bloque anterior
        const blocksBehind = currentNetworkBlock - lastScanned;

        if (blocksBehind > SYNC_THRESHOLD_BSC) {
            console.log(`[Monitor BSC] Sincronización en lotes iniciada para ${wallet.address}. ${blocksBehind} bloques de diferencia.`);
            let fromBlock = lastScanned + 1;
            while (fromBlock < currentNetworkBlock) {
                const toBlock = Math.min(fromBlock + BATCH_SIZE_BSC - 1, currentNetworkBlock);
                await scanBscBlockRange(wallet, fromBlock, toBlock);
                await CryptoWallet.findByIdAndUpdate(wallet._id, { lastScannedBlock: toBlock });
                fromBlock = toBlock + 1;
                await sleep(550);
            }
        } else if (blocksBehind > 0) {
            const latestBlockFound = await scanBscBlockRange(wallet, lastScanned + 1, currentNetworkBlock);
            if (latestBlockFound > lastScanned) {
                 await CryptoWallet.findByIdAndUpdate(wallet._id, { lastScannedBlock: latestBlockFound });
            }
        }
        await sleep(550);
    }
}

// =====================================================================================
// ==================== MONITOR DE LA RED TRON (NUEVA IMPLEMENTACIÓN) ==================
// =====================================================================================

/**
 * Escanea una dirección de TRON en busca de nuevos depósitos (USDT y TRX).
 * @param {object} wallet - El documento de CryptoWallet de nuestra DB.
 */
async function scanTronAddress(wallet) {
    // TronGrid usa timestamp en milisegundos. Añadimos 1ms para no incluir la última tx ya vista.
    const minTimestamp = wallet.lastScannedTimestamp ? wallet.lastScannedTimestamp + 1 : 0;
    let latestTimestampInScan = wallet.lastScannedTimestamp || 0;

    try {
        // 1. Escanear transacciones de Tokens TRC-20 (USDT)
        const usdtUrl = `https://api.trongrid.io/v1/accounts/${wallet.address}/transactions/trc20?only_to=true&min_timestamp=${minTimestamp}&contract_address=${USDT_CONTRACT_TRON}&limit=200`;
        const usdtResponse = await axios.get(usdtUrl, { headers: { 'TRON-PRO-API-KEY': TRON_API_KEY } });

        if (usdtResponse.data.success && Array.isArray(usdtResponse.data.data)) {
            for (const tx of usdtResponse.data.data) {
                // 'transaction_id' es el hash en TronGrid
                const amount = parseFloat(ethers.utils.formatUnits(tx.value, tx.token_info.decimals || 6));
                await processDeposit(tx, wallet, amount, 'USDT', tx.transaction_id, tx.block_timestamp);
                latestTimestampInScan = Math.max(latestTimestampInScan, tx.block_timestamp);
            }
        }
        await sleep(300); // Pausa entre llamadas

        // 2. Escanear transacciones nativas (TRX)
        const trxUrl = `https://api.trongrid.io/v1/accounts/${wallet.address}/transactions?only_to=true&min_timestamp=${minTimestamp}&limit=200`;
        const trxResponse = await axios.get(trxUrl, { headers: { 'TRON-PRO-API-KEY': TRON_API_KEY } });

        if (trxResponse.data.success && Array.isArray(trxResponse.data.data)) {
            for (const tx of trxResponse.data.data) {
                // Buscamos solo transacciones de tipo 'TransferContract' con valor.
                if (tx.raw_data.contract[0].type === 'TransferContract' && tx.ret[0].contractRet === 'SUCCESS') {
                    const transferData = tx.raw_data.contract[0].parameter.value;
                    const amountInSun = transferData.amount;
                    if (amountInSun > 0) {
                        const amount = parseFloat(ethers.utils.formatUnits(amountInSun, 6)); // TRX tiene 6 decimales (SUN)
                        await processDeposit(transferData, wallet, amount, 'TRX', tx.txID, tx.block_timestamp);
                        latestTimestampInScan = Math.max(latestTimestampInScan, tx.block_timestamp);
                    }
                }
            }
        }
        
    } catch (error) {
        console.error(`[Monitor TRON] Error escaneando ${wallet.address}:`, error.response ? error.response.data : error.message);
    }
    
    // Si encontramos una transacción más reciente, actualizamos el timestamp en la DB
    if (latestTimestampInScan > (wallet.lastScannedTimestamp || 0)) {
        await CryptoWallet.findByIdAndUpdate(wallet._id, { lastScannedTimestamp: latestTimestampInScan });
        // console.log(`[Monitor TRON] Wallet ${wallet.address} actualizada al timestamp ${latestTimestampInScan}.`);
    }
}

async function checkTronTransactions() {
    console.log("[Monitor TRON] Iniciando ciclo de escaneo STATEFUL para TRON.");
    const wallets = await CryptoWallet.find({ chain: 'TRON' });
    if (wallets.length === 0) return;

    for (const wallet of wallets) {
        await scanTronAddress(wallet);
        await sleep(550); // Pausa entre el escaneo de cada wallet para no saturar la API
    }
}

// =====================================================================================
// ========================== SERVICIO PRINCIPAL DE INICIO ===========================
// =====================================================================================

const startMonitoring = () => {
  console.log('✅ Iniciando servicio de monitoreo de transacciones COMPLETO (BSC + TRON)...');
  
  const runChecks = async () => {
    console.log("--- [Monitor] Iniciando ciclo de monitoreo de ambas cadenas ---");
    // Ejecutamos ambas comprobaciones en paralelo para mayor eficiencia
    await Promise.all([
        checkBscTransactions(),
        checkTronTransactions()
    ]);
    console.log("--- [Monitor] Ciclo de monitoreo finalizado. Esperando al siguiente. ---");
  };
  
  runChecks();
  // El intervalo se puede ajustar, 60 segundos es un valor seguro.
  setInterval(runChecks, 60000); 
};

module.exports = { startMonitoring };