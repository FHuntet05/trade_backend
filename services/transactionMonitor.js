// backend/services/transactionMonitor.js (MODIFICADO - Stateful)
const axios = require('axios');
const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');
const CryptoWallet = require('../models/cryptoWalletModel');
const { ethers } = require('ethers');
const { sendTelegramMessage } = require('./notificationService');
const { getPrice } = require('./priceService');

const USDT_CONTRACT_BSC = '0x55d398326f99059fF775485246999027B3197955';
const USDT_CONTRACT_TRON = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// La función processDeposit no necesita cambios. Su lógica de idempotencia sigue siendo válida.
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
        user: wallet.user,
        type: 'deposit',
        amount: amountInUSDT,
        currency: 'USDT',
        description: `Depósito de ${amount.toFixed(6)} ${currency} acreditado como ${amountInUSDT.toFixed(2)} USDT`,
        metadata: {
            txid: txid,
            chain: wallet.chain,
            fromAddress: tx.from || tx.owner_address,
            toAddress: tx.to || tx.to_address,
            originalAmount: amount.toString(),
            originalCurrency: currency,
            priceUsed: price.toString(),
            blockNumber: tx.blockNumber, // Guardamos el número de bloque
        }
    });

    console.log(`[ProcessDeposit] ÉXITO: Usuario ${user.username} acreditado con ${amountInUSDT.toFixed(2)} USDT.`);

    if (user.telegramId) {
        const message = `✅ <b>¡Depósito confirmado!</b>\n\nSe han acreditado <b>${amountInUSDT.toFixed(2)} USDT</b> a tu saldo.\n\nGracias por confiar en NEURO LINK.`;
        await sendTelegramMessage(user.telegramId, message);
    }
}

async function checkBscTransactions() {
    console.log("[Monitor BSC] Iniciando ciclo de escaneo STATEFUL para BSC.");
    const wallets = await CryptoWallet.find({ chain: 'BSC' });
    if (wallets.length === 0) return;
    
    console.log(`[Monitor BSC] Encontradas ${wallets.length} wallets de BSC para monitorear.`);

    for (const wallet of wallets) {
        // --- LÓGICA STATEFUL ---
        // 1. Inicializamos el bloque más nuevo de este ciclo con el último conocido.
        let latestBlockInCycle = wallet.lastScannedBlock;
        // 2. El bloque de inicio para la API es el siguiente al último escaneado.
        const startBlock = wallet.lastScannedBlock + 1;

        console.log(`[Monitor BSC] Escaneando wallet ${wallet.address} desde el bloque ${startBlock}`);

        try {
            // 3. Usamos startBlock en la URL de la API en lugar de '0'
            const usdtUrl = `https://api.bscscan.com/api?module=account&action=tokentx&address=${wallet.address}&contractaddress=${USDT_CONTRACT_BSC}&startblock=${startBlock}&endblock=99999999&sort=asc&apikey=${process.env.BSCSCAN_API_KEY}`;
            const usdtResponse = await axios.get(usdtUrl);

            if (usdtResponse.data.status === '1' && Array.isArray(usdtResponse.data.result) && usdtResponse.data.result.length > 0) {
                for (const tx of usdtResponse.data.result) {
                    if (tx.to.toLowerCase() === wallet.address.toLowerCase()) {
                        const amount = parseFloat(ethers.utils.formatUnits(tx.value, tx.tokenDecimal));
                        await processDeposit(tx, wallet, amount, 'USDT', tx.hash);
                        // 4. Actualizamos el bloque más nuevo visto en este ciclo
                        latestBlockInCycle = Math.max(latestBlockInCycle, parseInt(tx.blockNumber));
                    }
                }
            }
            
            const bnbUrl = `https://api.bscscan.com/api?module=account&action=txlist&address=${wallet.address}&startblock=${startBlock}&endblock=99999999&sort=asc&apikey=${process.env.BSCSCAN_API_KEY}`;
            const bnbResponse = await axios.get(bnbUrl);
            if (bnbResponse.data.status === '1' && Array.isArray(bnbResponse.data.result)) {
                for (const tx of bnbResponse.data.result) {
                    if (tx.to.toLowerCase() === wallet.address.toLowerCase() && tx.value !== "0") {
                        const amount = parseFloat(ethers.utils.formatEther(tx.value));
                        await processDeposit(tx, wallet, amount, 'BNB', tx.hash);
                        // 4. Actualizamos también con los bloques de transacciones BNB
                        latestBlockInCycle = Math.max(latestBlockInCycle, parseInt(tx.blockNumber));
                    }
                }
            }
            
            // 5. Si encontramos transacciones nuevas, actualizamos la DB.
            if (latestBlockInCycle > wallet.lastScannedBlock) {
                await CryptoWallet.findByIdAndUpdate(wallet._id, { lastScannedBlock: latestBlockInCycle });
                console.log(`[Monitor BSC] Wallet ${wallet.address} actualizada al bloque ${latestBlockInCycle}.`);
            }

        } catch (error) {
            console.error(`[Monitor BSC] Error monitoreando wallet ${wallet.address}:`, error.message);
        }
        
        await sleep(550); 
    }
}

async function checkTronTransactions() {
    // NOTA: La lógica de TronGrid es diferente y no usa 'startblock'.
    // Por ahora, la dejamos como está para mantener la estabilidad, ya que el problema crítico estaba en BSC.
    // Una implementación "stateful" para Tron requeriría guardar el último 'transaction_id' o 'block_timestamp'.
    const wallets = await CryptoWallet.find({ chain: 'TRON' });
    if (wallets.length === 0) return;

    for (const wallet of wallets) {
        try {
            // Esta API devuelve las transacciones más recientes, por lo que el riesgo de perder una es bajo.
            const url = `https://api.trongrid.io/v1/accounts/${wallet.address}/transactions/trc20?limit=50&contract_address=${USDT_CONTRACT_TRON}&only_to=true`;
            const response = await axios.get(url, { headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY } });

            if (response.data.success && response.data.data.length > 0) {
                for (const tx of response.data.data) {
                    // El filtro `only_to=true` ya asegura que la wallet es la receptora.
                    const amount = parseFloat(ethers.utils.formatUnits(tx.value, tx.token_info.decimals));
                    await processDeposit(tx, wallet, amount, 'USDT', tx.transaction_id);
                }
            }
        } catch (error) {
            console.error(`[Monitor TRON] Error monitoreando wallet ${wallet.address}:`, error.message);
        }
        await sleep(550);
    }
}


const startMonitoring = () => {
  console.log('✅ Iniciando servicio de monitoreo de transacciones COMPLETO (STATEFUL)...');
  const runChecks = async () => {
    await checkBscTransactions();
    await checkTronTransactions();
  };
  
  runChecks();
  setInterval(runChecks, 60000);
};

module.exports = { startMonitoring };