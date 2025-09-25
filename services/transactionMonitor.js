// RUTA: backend/services/transactionMonitor.js (VERSIÓN "NEXUS - STABILITY HARDENING")

const { ethers } = require('ethers');
const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');
const CryptoWallet = require('../models/cryptoWalletModel');
const blockchainService = require('./blockchainService');
const { sendTelegramMessage } = require('./notificationService');
const { distributeDepositCommissions } = require('./commissionService');

// --- CONFIGURACIÓN DE CONSTANTES Y CONTRATOS ---
const USDT_CONTRACT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const USDT_ABI = ['event Transfer(address indexed from, address indexed to, uint256 value)'];
const USDT_INTERFACE = new ethers.utils.Interface(USDT_ABI);
const USDT_TRANSFER_TOPIC = USDT_INTERFACE.getEventTopic('Transfer');
const BSC_API_KEY = process.env.BSCSCAN_API_KEY;

// [NEXUS STABILITY] - Constante para controlar el tamaño del lote. 2000 es un valor conservador y seguro.
const RPC_BATCH_SIZE = 2000;

// --- FUNCIÓN CENTRAL DE PROCESAMIENTO DE DEPÓSITOS ---
async function processDeposit(wallet, amount, currency, txHash, blockNumber, fromAddress) {
    const existingTx = await Transaction.findOne({ 'metadata.txid': txHash });
    if (existingTx) return;

    console.log(`[ProcessDeposit] Procesando nuevo depósito: ${amount} ${currency} para usuario ${wallet.user} (TXID: ${txHash})`);
    
    const amountInUSDT = currency === 'USDT' ? amount : (amount * (await blockchainService.getPrice('BNB')));
    if (amountInUSDT === null) {
        console.error(`[ProcessDeposit] No se pudo obtener el precio para ${currency}. Saltando TX ${txHash}`);
        return;
    }

    const userBeforeUpdate = await User.findById(wallet.user).select('hasMadeFirstDeposit username');
    if (!userBeforeUpdate) {
        console.error(`[ProcessDeposit] Usuario no encontrado para wallet ${wallet.address}. Abortando.`);
        return;
    }
    const isFirstDeposit = !userBeforeUpdate.hasMadeFirstDeposit;

    const updatedUser = await User.findByIdAndUpdate(wallet.user, {
        $inc: { 'balance.usdt': amountInUSDT, 'totalRecharge': amountInUSDT },
        $set: { hasMadeFirstDeposit: true }
    }, { new: true });

    if (!updatedUser) {
        console.error(`[ProcessDeposit] Fallo al actualizar el usuario para wallet ${wallet.address}. Abortando.`);
        return;
    }

    await Transaction.create({
        user: wallet.user, type: 'deposit', amount: amountInUSDT, currency: 'USDT',
        description: `Depósito de ${amount.toFixed(6)} ${currency} acreditado como ${amountInUSDT.toFixed(2)} USDT`,
        metadata: {
            txid: txHash, chain: 'BSC', fromAddress, toAddress: wallet.address,
            originalAmount: amount.toString(), originalCurrency: currency, blockIdentifier: blockNumber.toString(),
        }
    });

    console.log(`[ProcessDeposit] ✅ ÉXITO: Usuario ${updatedUser.username} acreditado con ${amountInUSDT.toFixed(2)} USDT.`);

    if (isFirstDeposit) {
        console.log(`[ProcessDeposit] Detectado primer depósito para ${updatedUser.username}. Disparando distribución de comisiones.`.cyan);
        distributeDepositCommissions(wallet.user, amountInUSDT);
    }

    if (updatedUser.telegramId) {
        const message = `✅ <b>¡Depósito confirmado!</b>\n\nSe han acreditado <b>${amountInUSDT.toFixed(2)} USDT</b> a tu saldo.`;
        sendTelegramMessage(updatedUser.telegramId, message);
    }
}

// --- ESCÁNER RPC PARA USDT ---
async function scanUsdtDepositsRpc(wallets, startBlock, endBlock) {
    if (startBlock > endBlock) return;
    console.log(`[Monitor RPC] Escaneando eventos USDT del bloque ${startBlock} al ${endBlock} (${endBlock - startBlock + 1} bloques)...`);
    
    const walletMap = new Map(wallets.map(w => [w.address.toLowerCase(), w]));

    const filter = {
        address: USDT_CONTRACT_ADDRESS,
        topics: [
            USDT_TRANSFER_TOPIC,
            null,
            Array.from(walletMap.keys()).map(address => ethers.utils.hexZeroPad(address, 32))
        ],
        fromBlock: startBlock,
        toBlock: endBlock
    };

    // [NEXUS STABILITY] - El try/catch se mantiene aquí para manejar errores específicos de esta función.
    try {
        const logs = await blockchainService.provider.getLogs(filter);
        for (const log of logs) {
            const parsedLog = USDT_INTERFACE.parseLog(log);
            const toAddress = parsedLog.args.to.toLowerCase();
            const wallet = walletMap.get(toAddress);
            if (wallet) {
                const amount = parseFloat(ethers.utils.formatUnits(parsedLog.args.value, 18));
                await processDeposit(wallet, amount, 'USDT', log.transactionHash, log.blockNumber, parsedLog.args.from);
            }
        }
    } catch (error) {
        console.error(`[Monitor RPC] Error específico al obtener logs de eventos USDT: ${error.message}`.red);
        // Relanzamos el error para que el bucle principal lo capture y detenga el procesamiento del lote.
        throw error; 
    }
}

// --- ESCÁNER DE COMPATIBILIDAD PARA BNB ---
async function scanBnbDepositsBscScan(wallet, startBlock, endBlock) {
    try {
        const url = `https://api.bscscan.com/api?module=account&action=txlist&address=${wallet.address}&startblock=${startBlock}&endblock=${endBlock}&sort=asc&apikey=${BSC_API_KEY}`;
        const response = await blockchainService.makeCachedRequest(url, 15);

        if (response.status === '1' && Array.isArray(response.result)) {
            for (const tx of response.result) {
                if (tx.to.toLowerCase() === wallet.address.toLowerCase() && tx.value !== "0" && tx.isError === "0") {
                    const amount = parseFloat(ethers.utils.formatEther(tx.value));
                    await processDeposit(wallet, amount, 'BNB', tx.hash, parseInt(tx.blockNumber), tx.from);
                }
            }
        }
    } catch (error) {
        console.error(`[Monitor BscScan] Excepción al escanear BNB para ${wallet.address}: ${error.message}`);
    }
}

// --- ORQUESTADOR PRINCIPAL DEL MONITOREO ---
const startMonitoring = () => {
    console.log('✅ Iniciando servicio de monitoreo de transacciones (RPC-First con Batching)...'.green.bold);

    const runChecks = async () => {
        console.log("--- [Monitor] Iniciando ciclo de monitoreo ---");
        
        // [NEXUS STABILITY] - Se envuelve TODA la lógica en un try/catch para prevenir cualquier crash.
        try {
            const wallets = await CryptoWallet.find({ chain: 'BSC' });
            if (wallets.length === 0) {
                console.log("[Monitor] No hay billeteras para escanear. Finalizando ciclo.");
                return;
            }

            const currentNetworkBlock = await blockchainService.provider.getBlockNumber();
            let lastProcessedBlock = (await CryptoWallet.findOne({ chain: 'BSC' }).sort({ lastScannedBlock: -1 }).select('lastScannedBlock'))?.lastScannedBlock || currentNetworkBlock - 1;
            
            let fromBlock = lastProcessedBlock + 1;
            const toBlock = currentNetworkBlock;

            if (fromBlock > toBlock) {
                console.log('[Monitor] El sistema está sincronizado. No hay nuevos bloques para escanear.');
            } else {
                 console.log(`[Monitor] Bloque de red actual: ${toBlock}. Sincronizando desde: ${fromBlock}`);

                while (fromBlock <= toBlock) {
                    const batchEndBlock = Math.min(fromBlock + RPC_BATCH_SIZE - 1, toBlock);
                    
                    try {
                        await scanUsdtDepositsRpc(wallets, fromBlock, batchEndBlock);
                        
                        for (const wallet of wallets) {
                            await scanBnbDepositsBscScan(wallet, fromBlock, batchEndBlock);
                            await new Promise(resolve => setTimeout(resolve, 250));
                        }
                        
                        await CryptoWallet.updateMany({ chain: 'BSC' }, { $set: { lastScannedBlock: batchEndBlock } });
                        console.log(`[Monitor] Lote ${fromBlock}-${batchEndBlock} procesado. 'lastScannedBlock' actualizado a ${batchEndBlock}.`.green);
                        
                        fromBlock = batchEndBlock + 1;
                    } catch (batchError) {
                        // El error ya fue logueado dentro de scanUsdtDepositsRpc, aquí solo lo confirmamos.
                        console.error(`[Monitor] Fallo en el lote ${fromBlock}-${batchEndBlock}. Deteniendo el escaneo para este ciclo. Se reintentará en 60s.`.red.bold);
                        // Rompemos el bucle 'while' para no continuar si un lote falla.
                        break; 
                    }
                }
            }
        } catch (mainCycleError) {
            console.error('[Monitor] ERROR CATASTRÓFICO en el ciclo principal de monitoreo. El servidor seguirá funcionando. Se reintentará en 60s.'.red.bgWhite.bold, mainCycleError);
        }

        console.log("--- [Monitor] Ciclo de monitoreo finalizado. Esperando al siguiente. ---");
    };

    runChecks();
    setInterval(runChecks, 60000);
};

module.exports = { startMonitoring };