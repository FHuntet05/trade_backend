// backend/services/transactionMonitor.js (CORREGIDO - Anti Rate-Limit)
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
        }
    });

    console.log(`[ProcessDeposit] ÉXITO: Usuario ${user.username} acreditado con ${amountInUSDT.toFixed(2)} USDT.`);

    if (user.telegramId) {
        const message = `✅ <b>¡Depósito confirmado!</b>\n\nSe han acreditado <b>${amountInUSDT.toFixed(2)} USDT</b> a tu saldo.\n\nGracias por confiar en NEURO LINK.`;
        await sendTelegramMessage(user.telegramId, message);
    }
}

async function checkBscTransactions() {
    console.log("[Monitor BSC] Iniciando ciclo de escaneo para BSC.");
    const wallets = await CryptoWallet.find({ chain: 'BSC' });
    if (wallets.length === 0) return;
    
    console.log(`[Monitor BSC] Encontradas ${wallets.length} wallets de BSC para monitorear.`);

    for (const wallet of wallets) {
        try {
            const usdtUrl = `https://api.bscscan.com/api?module=account&action=tokentx&address=${wallet.address}&contractaddress=${USDT_CONTRACT_BSC}&startblock=0&endblock=99999999&sort=asc&apikey=${process.env.BSCSCAN_API_KEY}`;
            const usdtResponse = await axios.get(usdtUrl);

            if (usdtResponse.data.status === '1' && Array.isArray(usdtResponse.data.result) && usdtResponse.data.result.length > 0) {
                for (const tx of usdtResponse.data.result) {
                    if (tx.to.toLowerCase() === wallet.address.toLowerCase()) {
                        const amount = parseFloat(ethers.utils.formatUnits(tx.value, tx.tokenDecimal));
                        await processDeposit(tx, wallet, amount, 'USDT', tx.hash);
                    }
                }
            }
            
            const bnbUrl = `https://api.bscscan.com/api?module=account&action=txlist&address=${wallet.address}&startblock=0&endblock=99999999&sort=asc&apikey=${process.env.BSCSCAN_API_KEY}`;
            const bnbResponse = await axios.get(bnbUrl);
            if (bnbResponse.data.status === '1' && Array.isArray(bnbResponse.data.result)) {
                for (const tx of bnbResponse.data.result) {
                    if (tx.to.toLowerCase() === wallet.address.toLowerCase() && tx.value !== "0") {
                        const amount = parseFloat(ethers.utils.formatEther(tx.value));
                        await processDeposit(tx, wallet, amount, 'BNB', tx.hash);
                    }
                }
            }

        } catch (error) {
            console.error(`[Monitor BSC] Error monitoreando wallet ${wallet.address}:`, error.message);
        }
        
        // --- CORRECCIÓN CLAVE ---
        // Añadimos una pausa de 550ms después de procesar cada wallet.
        // BscScan tiene un límite de 2 llamadas/seg. Esta pausa asegura que nunca lo superemos.
        await sleep(550); 
    }
}

async function checkTronTransactions() {
    // La lógica de Tron no parece tener problemas de rate-limit por ahora, se deja como está.
    // Si aparecieran, se aplicaría una pausa similar a la de BSC.
    const wallets = await CryptoWallet.find({ chain: 'TRON' });
    if (wallets.length === 0) return;

    for (const wallet of wallets) {
        try {
            const url = `https://api.trongrid.io/v1/accounts/${wallet.address}/transactions/trc20?limit=50&contract_address=${USDT_CONTRACT_TRON}`;
            const response = await axios.get(url, { headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY } });

            if (response.data.success && response.data.data.length > 0) {
                for (const tx of response.data.data) {
                    if (tx.to.toLowerCase() === wallet.address.toLowerCase()) {
                        const amount = parseFloat(ethers.utils.formatUnits(tx.value, tx.token_info.decimals));
                        await processDeposit(tx, wallet, amount, 'USDT', tx.transaction_id);
                    }
                }
            }
        } catch (error) {
            console.error(`[Monitor TRON] Error monitoreando wallet ${wallet.address}:`, error.message);
        }
        await sleep(550); // Añadimos una pausa también aquí por si acaso el rate limit es compartido.
    }
}

const startMonitoring = () => {
  console.log('✅ Iniciando servicio de monitoreo de transacciones COMPLETO...');
  const runChecks = async () => {
    await checkBscTransactions();
    await checkTronTransactions();
  };
  
  runChecks();
  setInterval(runChecks, 60000);
};

module.exports = { startMonitoring };