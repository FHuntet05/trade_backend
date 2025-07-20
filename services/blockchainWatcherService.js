// backend/services/transactionMonitor.js (DEPURACIÓN EXTREMA v35.6 - ULTIMA ESPERANZA DE LOGS)
const axios = require('axios');
const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');
const CryptoWallet = require('../models/cryptoWalletModel');
const { ethers } = require('ethers');
const { sendTelegramMessage } = require('./notificationService');
const { getPrice } = require('./priceService');

// --- CONFIGURACIÓN DE CONSTANTES ---
const USDT_CONTRACT_BSC = '0x55d398326f99059fF775485246999027B3197955'; // Tether USDT BEP20
const BUSD_CONTRACT_BSC = '0xe9e7CEA3DedcA5984780Bf86fEE1060eC3d';     // Binance USD (BUSD) BEP20
const BSC_STABLECOIN_CONTRACTS = [
    USDT_CONTRACT_BSC.toLowerCase(),
    BUSD_CONTRACT_BSC.toLowerCase()
];
const TRON_USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

const BSC_API_KEY = process.env.BSCSCAN_API_KEY;
const TRON_API_KEY = process.env.TRONGRID_API_KEY;

// --- CONFIGURACIÓN DE SINCRONIZACIÓN (BSC) ---
const BATCH_SIZE_BSC = 5000;
const SYNC_THRESHOLD_BSC = 500000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function processDeposit(tx, wallet, amount, currency, txid, blockIdentifier) {
    const existingTx = await Transaction.findOne({ 'metadata.txid': txid });
    if (existingTx) {
        // console.log(`[ProcessDeposit] Depósito ya procesado: ${txid}. Saltando.`);
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

async function getCurrentBscBlock() {
    console.log("[Monitor BSC - DEBUG - getCurrentBscBlock] Iniciando... ");
    try {
        const url = `https://api.bscscan.com/api?module=proxy&action=eth_blockNumber&apikey=${BSC_API_KEY}`;
        console.log(`[Monitor BSC - DEBUG - getCurrentBscBlock] URL de consulta: ${url}`);
        
        const response = await axios.get(url, { timeout: 10000 }); // Añadir timeout explícito
        
        console.log(`[Monitor BSC - DEBUG - getCurrentBscBlock] Respuesta de Axios (status): ${response.status}`);
        console.log(`[Monitor BSC - DEBUG - getCurrentBscBlock] Respuesta de Axios (data):`, response.data);
        
        if (response.data && response.data.result) {
            const blockNumber = parseInt(response.data.result, 16);
            console.log(`[Monitor BSC - DEBUG - getCurrentBscBlock] Bloque actual parseado: ${blockNumber}`);
            return blockNumber;
        } else {
            console.error("[Monitor BSC - DEBUG - getCurrentBscBlock] La respuesta de BscScan no contiene 'result' o es nula.");
            return null;
        }
    } catch (error) {
        console.error(`[Monitor BSC - DEBUG - getCurrentBscBlock] Excepción al obtener bloque actual: ${error.message}`);
        if (error.response) {
            console.error(`[Monitor BSC - DEBUG - getCurrentBscBlock] Error Response Status: ${error.response.status}`);
            console.error(`[Monitor BSC - DEBUG - getCurrentBscBlock] Error Response Data:`, error.response.data);
        } else if (error.request) {
            console.error(`[Monitor BSC - DEBUG - getCurrentBscBlock] Error Request (No Response from Server):`, error.request);
        }
        console.error(`[Monitor BSC - DEBUG - getCurrentBscBlock] Error Stack:`, error.stack);
        return null;
    }
}

async function scanBscBlockRange(wallet, startBlock, endBlock) {
    let latestBlockInScan = startBlock;
    try {
        console.log(`[Monitor BSC - DEBUG - scanBscBlockRange] Iniciando escaneo para ${wallet.address} de ${startBlock} a ${endBlock}`);
        
        const allTokenTxUrl = `https://api.bscscan.com/api?module=account&action=tokentx&address=${wallet.address}&startblock=${startBlock}&endblock=${endBlock}&sort=asc&apikey=${BSC_API_KEY}`;
        console.log(`[Monitor BSC - DEBUG - scanBscBlockRange] URL BEP20: ${allTokenTxUrl}`);
        const allTokenTxResponse = await axios.get(allTokenTxUrl, { timeout: 15000 }); // Añadir timeout
        
        console.log(`[Monitor BSC - DEBUG - scanBscBlockRange] BscScan All BEP20 Response Status para ${wallet.address}: ${allTokenTxResponse.data.status}`);
        if (allTokenTxResponse.data.result && allTokenTxResponse.data.result.length > 0) {
            console.log(`[Monitor BSC - DEBUG - scanBscBlockRange] BscScan All BEP20 Result Length para ${wallet.address}: ${allTokenTxResponse.data.result.length}. Primeras 2 TXs:`, allTokenTxResponse.data.result.slice(0, 2));
        } else {
            console.log(`[Monitor BSC - DEBUG - scanBscBlockRange] BscScan All BEP20 Result es vacío o nulo para ${wallet.address}.`);
        }

        if (allTokenTxResponse.data.status === '1' && Array.isArray(allTokenTxResponse.data.result)) {
            for (const tx of allTokenTxResponse.data.result) {
                const txContractAddressLower = tx.contractAddress ? tx.contractAddress.toLowerCase() : null;
                if (tx.to.toLowerCase() === wallet.address.toLowerCase() && BSC_STABLECOIN_CONTRACTS.includes(txContractAddressLower)) {
                    const amount = parseFloat(ethers.utils.formatUnits(tx.value, tx.tokenDecimal));
                    const originalCurrency = txContractAddressLower === USDT_CONTRACT_BSC.toLowerCase() ? 'USDT' : 
                                             (txContractAddressLower === BUSD_CONTRACT_BSC.toLowerCase() ? 'BUSD' : 'UNKNOWN_TOKEN');
                    
                    console.log(`[Monitor BSC - DEBUG - scanBscBlockRange] Stablecoin (${originalCurrency}) detectada: ${tx.hash}`);
                    await processDeposit(tx, wallet, amount, originalCurrency, tx.hash, tx.blockNumber);
                    latestBlockInScan = Math.max(latestBlockInScan, parseInt(tx.blockNumber));
                } else if (tx.to.toLowerCase() === wallet.address.toLowerCase()) {
                    console.log(`[Monitor BSC - DEBUG - scanBscBlockRange] Ignorando token no soportado: ${tx.tokenSymbol} (${tx.contractAddress}) para ${wallet.address}.`);
                }
            }
        }
        await sleep(300);

        const bnbUrl = `https://api.bscscan.com/api?module=account&action=txlist&address=${wallet.address}&startblock=${startBlock}&endblock=${endBlock}&sort=asc&apikey=${BSC_API_KEY}`;
        console.log(`[Monitor BSC - DEBUG - scanBscBlockRange] URL BNB: ${bnbUrl}`);
        const bnbResponse = await axios.get(bnbUrl, { timeout: 15000 }); // Añadir timeout
        
        console.log(`[Monitor BSC - DEBUG - scanBscBlockRange] BscScan BNB Response Status para ${wallet.address}: ${bnbResponse.data.status}`);
        if (bnbResponse.data.result && bnbResponse.data.result.length > 0) {
            console.log(`[Monitor BSC - DEBUG - scanBscBlockRange] BscScan BNB Result Length para ${wallet.address}: ${bnbResponse.data.result.length}. Primeras 2 TXs:`, bnbResponse.data.result.slice(0, 2));
        } else {
            console.log(`[Monitor BSC - DEBUG - scanBscBlockRange] BscScan BNB Result es vacío o nulo para ${wallet.address}.`);
        }

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
        console.error(`[Monitor BSC - DEBUG - scanBscBlockRange] EXCEPCIÓN al escanear rango ${startBlock}-${endBlock} para ${wallet.address}: ${error.message}`);
        if (error.response) {
            console.error(`[Monitor BSC - DEBUG - scanBscBlockRange] Error Response Status: ${error.response.status}`);
            console.error(`[Monitor BSC - DEBUG - scanBscBlockRange] Error Response Data:`, error.response.data);
        } else if (error.request) {
            console.error(`[Monitor BSC - DEBUG - scanBscBlockRange] Error Request (No Response from Server):`, error.request);
        }
        console.error(`[Monitor BSC - DEBUG - scanBscBlockRange] Error Stack:`, error.stack);
    }
    return latestBlockInScan;
}

async function checkBscTransactions() {
    console.log("[Monitor BSC] Iniciando ciclo de escaneo STATEFUL para BSC.");
    const wallets = await CryptoWallet.find({ chain: 'BSC' });
    if (wallets.length === 0) {
        console.log("[Monitor BSC] No hay billeteras BSC en el sistema para escanear.");
        return;
    }

    const currentNetworkBlock = await getCurrentBscBlock();
    if (!currentNetworkBlock) {
        console.error("[Monitor BSC] No se pudo obtener el bloque de red actual. Saltando ciclo de escaneo de wallets.");
        return;
    }
    console.log(`[Monitor BSC] Encontradas ${wallets.length} wallets. Bloque de red actual: ${currentNetworkBlock}`);

    for (const wallet of wallets) {
        console.log(`[Monitor BSC - DEBUG - checkBscTransactions] Procesando wallet: ${wallet.address} (UserID: ${wallet.user})`);
        let lastScanned = wallet.lastScannedBlock || 0; 
        if (lastScanned === 0) {
            console.log(`[Monitor BSC] Wallet ${wallet.address} (UserID: ${wallet.user}) se escaneará desde el bloque 0 para su primera sincronización.`);
        }
        
        const blocksBehind = currentNetworkBlock - lastScanned;

        if (blocksBehind > SYNC_THRESHOLD_BSC) {
            console.log(`[Monitor BSC] Sincronización en lotes iniciada para ${wallet.address}. ${blocksBehind} bloques de diferencia.`);
            let fromBlock = lastScanned + 1;
            while (fromBlock < currentNetworkBlock) {
                const toBlock = Math.min(fromBlock + BATCH_SIZE_BSC - 1, currentNetworkBlock);
                // --- INICIO DE LOGS EXTREMOS ---
                console.log(`[Monitor BSC - DEBUG - checkBscTransactions] Entrando a scanBscBlockRange para lote: ${fromBlock} -> ${toBlock}`);
                // --- FIN DE LOGS EXTREMOS ---
                await scanBscBlockRange(wallet, fromBlock, toBlock);
                await CryptoWallet.findByIdAndUpdate(wallet._id, { lastScannedBlock: toBlock });
                fromBlock = toBlock + 1;
                await sleep(550);
            }
            await CryptoWallet.findByIdAndUpdate(wallet._id, { lastScannedBlock: currentNetworkBlock });
            console.log(`[Monitor BSC] Sincronización en lotes completada para ${wallet.address}.`);
        } else if (blocksBehind > 0) {
            const startBlock = lastScanned + 1;
            console.log(`[Monitor BSC] Monitoreo normal para ${wallet.address} desde el bloque ${startBlock} hasta ${currentNetworkBlock}.`);
            console.log(`[Monitor BSC - DEBUG - checkBscTransactions] Entrando a scanBscBlockRange (normal) para: ${startBlock} -> ${currentNetworkBlock}`);
            const latestBlockFound = await scanBscBlockRange(wallet, startBlock, currentNetworkBlock);
            if (latestBlockFound > lastScanned) {
                 await CryptoWallet.findByIdAndUpdate(wallet._id, { lastScannedBlock: latestBlockFound });
                 console.log(`[Monitor BSC] Wallet ${wallet.address} actualizada al bloque ${latestBlockFound}.`);
            } else {
                 await CryptoWallet.findByIdAndUpdate(wallet._id, { lastScannedBlock: currentNetworkBlock }); 
                 console.log(`[Monitor BSC] Wallet ${wallet.address} (UserID: ${wallet.user}) ya está al día en el bloque ${currentNetworkBlock}.`);
            }
        } else {
            console.log(`[Monitor BSC] Wallet ${wallet.address} (UserID: ${wallet.user}) ya está al día en el bloque ${currentNetworkBlock}.`);
        }
        await sleep(550);
    }
}

async function scanTronAddress(wallet) {
    const minTimestamp = wallet.lastScannedTimestamp ? wallet.lastScannedTimestamp + 1 : 0;
    let latestTimestampInScan = wallet.lastScannedTimestamp || 0;

    try {
        console.log(`[Monitor TRON - DEBUG] Consultando TronGrid para ${wallet.address} (USDT) desde timestamp ${minTimestamp}`);
        const usdtUrl = `https://api.trongrid.io/v1/accounts/${wallet.address}/transactions/trc20?only_to=true&min_timestamp=${minTimestamp}&contract_address=${TRON_USDT_CONTRACT}&limit=200`;
        const usdtResponse = await axios.get(usdtUrl, { timeout: 15000 });
        
        console.log(`[Monitor TRON - DEBUG] TronGrid USDT Response Success para ${wallet.address}: ${usdtResponse.data.success}`);
        if (usdtResponse.data.data && usdtResponse.data.data.length > 0) {
            console.log(`[Monitor TRON - DEBUG] TronGrid USDT Result Length para ${wallet.address}: ${usdtResponse.data.data.length}. Primeras 2 TXs:`, usdtResponse.data.data.slice(0, 2));
        } else {
            console.log(`[Monitor TRON - DEBUG] TronGrid USDT Result es vacío o nulo para ${wallet.address}.`);
        }

        if (usdtResponse.data.success && Array.isArray(usdtResponse.data.data)) {
            for (const tx of usdtResponse.data.data) {
                const amount = parseFloat(ethers.utils.formatUnits(tx.value, tx.token_info.decimals || 6));
                await processDeposit(tx, wallet, amount, 'USDT', tx.transaction_id, tx.block_timestamp);
                latestTimestampInScan = Math.max(latestTimestampInScan, tx.block_timestamp);
            }
        }
        await sleep(300);

        console.log(`[Monitor TRON - DEBUG] Consultando TronGrid para ${wallet.address} (TRX) desde timestamp ${minTimestamp}`);
        const trxUrl = `https://api.trongrid.io/v1/accounts/${wallet.address}/transactions?only_to=true&min_timestamp=${minTimestamp}&limit=200`;
        const trxResponse = await axios.get(trxUrl, { timeout: 15000 });

        console.log(`[Monitor TRON - DEBUG] TronGrid TRX Response Success para ${wallet.address}: ${trxResponse.data.success}`);
        if (trxResponse.data.data && trxResponse.data.data.length > 0) {
            console.log(`[Monitor TRON - DEBUG] TronGrid TRX Result Length para ${wallet.address}: ${trxResponse.data.data.length}. Primeras 2 TXs:`, trxResponse.data.data.slice(0, 2));
        } else {
            console.log(`[Monitor TRON - DEBUG] TronGrid TRX Result es vacío o nulo para ${wallet.address}.`);
        }

        if (trxResponse.data.success && Array.isArray(trxResponse.data.data)) {
            for (const tx of trxResponse.data.data) {
                if (tx.raw_data.contract[0].type === 'TransferContract' && tx.ret[0].contractRet === 'SUCCESS') {
                    const transferData = tx.raw_data.contract[0].parameter.value;
                    const amountInSun = transferData.amount;
                    if (amountInSun > 0) {
                        const amount = parseFloat(ethers.utils.formatUnits(amountInSun, 6));
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

const startMonitoring = () => {
  console.log('✅ Iniciando servicio de monitoreo de transacciones COMPLETO (BSC + TRON)...');
  
  const runChecks = async () => {
    console.log("--- [Monitor] Iniciando ciclo de monitoreo de ambas cadenas ---");
    await Promise.all([
        checkBscTransactions(),
        checkTronTransactions()
    ]);
    console.log("--- [Monitor] Ciclo de monitoreo finalizado. Esperando al siguiente. ---");
  };
  
  runChecks();
  setInterval(runChecks, 60000); 
};

module.exports = { startMonitoring };