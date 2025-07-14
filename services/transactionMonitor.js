// backend/services/transactionMonitor.js
const axios = require('axios');
const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');
const CryptoWallet = require('../models/cryptoWalletModel');
const { ethers } = require('ethers');
const { sendTelegramMessage } = require('./notificationService');
const { getPrice } = require('./priceService');

// --- Direcciones de Contratos de Tokens USDT ---
const USDT_CONTRACT_BSC = '0x55d398326f99059fF775485246999027B3197955';
const USDT_CONTRACT_TRON = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

/**
 * Procesa un depósito confirmado: convierte a USDT, acredita al usuario,
 * guarda la transacción y notifica por Telegram.
 * @param {object} tx - El objeto de la transacción de la API del explorador.
 * @param {object} wallet - El documento de la wallet de nuestra base de datos.
 * @param {number} amount - La cantidad de la criptomoneda depositada.
 * @param {string} currency - El ticker de la criptomoneda (e.g., 'BNB', 'USDT', 'TRX').
 * @param {string} txid - El hash/ID único de la transacción.
 */
async function processDeposit(tx, wallet, amount, currency, txid) {
    const existingTx = await Transaction.findOne({ 'metadata.txid': txid });
    if (existingTx) {
        return; // Ya procesada, salimos para evitar doble acreditación.
    }

    console.log(`[Monitor] Depósito detectado: ${amount} ${currency} para wallet ${wallet.address}`);
    
    const price = getPrice(currency);
    if (!price) {
        console.error(`[Monitor] PRECIO NO ENCONTRADO para ${currency}. Saltando transacción ${txid}.`);
        return; // No procesar si no tenemos un precio fiable.
    }
    const amountInUSDT = amount * price;

    const user = await User.findByIdAndUpdate(wallet.user, { $inc: { 'balance.usdt': amountInUSDT } }, { new: true });
    
    if (!user) {
        console.error(`[Monitor] Usuario no encontrado para wallet ${wallet._id}. Abortando depósito.`);
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

    console.log(`[Monitor] ÉXITO: Usuario ${user.username} acreditado con ${amountInUSDT.toFixed(2)} USDT.`);

    if (user.telegramId) {
        const message = `✅ <b>¡Depósito confirmado!</b>\n\nSe han acreditado <b>${amountInUSDT.toFixed(2)} USDT</b> a tu saldo.\n\nGracias por confiar en NEURO LINK.`;
        await sendTelegramMessage(user.telegramId, message);
    }
}

/**
 * Escanea la Binance Smart Chain en busca de transacciones de BNB y USDT.
 */
async function checkBscTransactions() {
    const wallets = await CryptoWallet.find({ chain: 'BSC' });
    if (wallets.length === 0) return;

    for (const wallet of wallets) {
        try {
            // 1. Monitorear BNB (moneda nativa)
            const bnbUrl = `https://api.bscscan.com/api?module=account&action=txlist&address=${wallet.address}&startblock=0&endblock=99999999&sort=asc&apikey=${process.env.BSCSCAN_API_KEY}`;
            const bnbResponse = await axios.get(bnbUrl);
            if (bnbResponse.data.status === '1') {
                for (const tx of bnbResponse.data.result) {
                    if (tx.to.toLowerCase() === wallet.address.toLowerCase() && tx.value !== "0") {
                        const amount = parseFloat(ethers.utils.formatEther(tx.value));
                        await processDeposit(tx, wallet, amount, 'BNB', tx.hash);
                    }
                }
            }
            
            // 2. Monitorear USDT (token BEP20)
            const usdtUrl = `https://api.bscscan.com/api?module=account&action=tokentx&address=${wallet.address}&contractaddress=${USDT_CONTRACT_BSC}&startblock=0&endblock=99999999&sort=asc&apikey=${process.env.BSCSCAN_API_KEY}`;
            const usdtResponse = await axios.get(usdtUrl);
            if (usdtResponse.data.status === '1') {
                for (const tx of usdtResponse.data.result) {
                    if (tx.to.toLowerCase() === wallet.address.toLowerCase()) {
                        const amount = parseFloat(ethers.utils.formatUnits(tx.value, tx.tokenDecimal));
                        await processDeposit(tx, wallet, amount, 'USDT', tx.hash);
                    }
                }
            }
        } catch (error) {
            console.error(`[Monitor] Error monitoreando wallet BSC ${wallet.address}:`, error.message);
        }
    }
}

/**
 * Escanea la red Tron en busca de transacciones de TRX y USDT.
 */
async function checkTronTransactions() {
    const wallets = await CryptoWallet.find({ chain: 'TRON' });
    if (wallets.length === 0) return;

    for (const wallet of wallets) {
        try {
            // La API V1 de TronGrid devuelve transacciones nativas y de tokens en el mismo endpoint.
            const url = `https://api.trongrid.io/v1/accounts/${wallet.address}/transactions?limit=50&only_to=true`;
            const response = await axios.get(url, { headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY } });

            if (response.data.success && response.data.data.length > 0) {
                for (const tx of response.data.data) {
                    if (!tx.raw_data.contract || tx.raw_data.contract.length === 0) continue;

                    const contract = tx.raw_data.contract[0];
                    const txid = tx.txID;

                    // 1. Monitorear TRX (moneda nativa)
                    if (contract.type === 'TransferContract') {
                        const amount = contract.parameter.value.amount / 1_000_000; // TRX tiene 6 decimales (1 TRX = 1,000,000 SUN)
                        await processDeposit({ ...contract.parameter.value, txid }, wallet, amount, 'TRX', txid);
                    }
                    
                    // 2. Monitorear USDT (token TRC20)
                    if (contract.type === 'TriggerSmartContract' && contract.parameter.value.contract_address === USDT_CONTRACT_TRON) {
                        // El método para transferencias TRC20 (transfer) es a9059cbb...
                        if (contract.parameter.value.data.startsWith('a9059cbb')) {
                            // Extraemos el valor del campo 'data'. Está en formato hexadecimal.
                            const valueHex = contract.parameter.value.data.substring(72);
                            const amount = parseInt(valueHex, 16) / 1_000_000; // USDT en TRC20 tiene 6 decimales.
                             await processDeposit({ ...contract.parameter.value, txid }, wallet, amount, 'USDT', txid);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`[Monitor] Error monitoreando wallet TRON ${wallet.address}:`, error.message);
        }
    }
}

/**
 * Inicia el servicio de monitoreo, ejecutando un ciclo de escaneo cada 60 segundos.
 */
const startMonitoring = () => {
  console.log('✅ Iniciando servicio de monitoreo de transacciones COMPLETO...');
  
  // Ejecutar una vez al inicio para no esperar el primer intervalo
  checkBscTransactions();
  checkTronTransactions();

  // Establecer el intervalo de sondeo (polling) - 60 segundos
  setInterval(async () => {
    // console.log('🔄 Ejecutando ciclo de monitoreo COMPLETO...');
    await checkBscTransactions();
    await checkTronTransactions();
  }, 60000); // 60,000 milisegundos = 1 minuto
};

module.exports = { startMonitoring };