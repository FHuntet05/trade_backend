// RUTA: backend/services/blockchainWatcherService.js
// VERSIÓN: v35.0 - "Verificación Total" - Solución Completa
// DESCRIPCIÓN: Servicio reconstruido que ahora incluye Detección, Verificación y Acreditación de depósitos.

const { ethers } = require('ethers');
const TronWeb = require('tronweb'); // Se usa 'tronweb' directamente, la instancia se crea localmente.
const axios = require('axios'); // Necesario para hacer llamadas a las APIs de los exploradores.
const CryptoWallet = require('../models/cryptoWalletModel');
const PendingTx = require('../models/pendingTxModel');
const User = require('../models/userModel'); // ¡IMPORTANTE! Asegúrese de que la ruta a su modelo de Usuario sea correcta.

// --- CONFIGURACIÓN CENTRALIZADA ---
// Es crucial obtener estos valores de las variables de entorno para seguridad y flexibilidad.
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY;
const TRONGRID_API_KEY = process.env.TRONGRID_API_KEY;
const BSC_USDT_CONTRACT_ADDRESS = process.env.BSC_USDT_CONTRACT_ADDRESS || '0x55d398326f99059fF775485246999027B3197955'; // Dirección de USDT (BEP20)
const TRON_USDT_CONTRACT_ADDRESS = process.env.TRON_USDT_CONTRACT_ADDRESS || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // Dirección de USDT (TRC20)

const bscProvider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');

// --- FASE 1: DETECCIÓN DE NUEVOS DEPÓSITOS ---

/**
 * Escanea una única dirección de criptomoneda en busca de nuevas transacciones de depósito.
 * @param {object} wallet - El documento de la billetera desde la base de datos (contiene address, chain, user).
 */
const scanAddressForDeposits = async (wallet) => {
    try {
        if (wallet.chain === 'BSC') {
            // Documentación de BscScan API: https://docs.bscscan.com/api-endpoints/accounts#get-a-list-of-bep20-token-transfer-events-by-address
            const apiUrl = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${BSC_USDT_CONTRACT_ADDRESS}&address=${wallet.address}&page=1&offset=50&sort=desc&apikey=${BSCSCAN_API_KEY}`;
            const response = await axios.get(apiUrl);

            if (response.data.status === '1' && response.data.result.length > 0) {
                for (const tx of response.data.result) {
                    // Procesamos solo transacciones ENTRANTES y que no hayamos visto antes.
                    // La API de BscScan usa lowercase para las direcciones, comparamos en minúsculas para seguridad.
                    if (tx.to.toLowerCase() === wallet.address.toLowerCase()) {
                        const txExists = await PendingTx.findOne({ txHash: tx.hash });
                        if (!txExists) {
                            const amount = parseFloat(ethers.utils.formatUnits(tx.value, 18)); // USDT en BSC tiene 18 decimales
                            console.log(`[Detector] Nuevo depósito BSC detectado para ${wallet.address}: ${amount} USDT. Hash: ${tx.hash}`);
                            await PendingTx.create({
                                user: wallet.user,
                                chain: 'BSC',
                                txHash: tx.hash,
                                fromAddress: tx.from,
                                toAddress: tx.to,
                                amount: amount,
                                status: 'PENDING', // El estado inicial es PENDIENTE de verificación en nodo.
                            });
                        }
                    }
                }
            }
        } else if (wallet.chain === 'TRON') {
            // Documentación de TronGrid API: https://developers.tron.network/docs/trc20-transaction-records
            const apiUrl = `https://api.trongrid.io/v1/accounts/${wallet.address}/transactions/trc20?only_to=true&contract_address=${TRON_USDT_CONTRACT_ADDRESS}&limit=50`;
            const response = await axios.get(apiUrl, { headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY } });

            if (response.data.success && response.data.data.length > 0) {
                for (const tx of response.data.data) {
                     const txExists = await PendingTx.findOne({ txHash: tx.transaction_id });
                     if (!txExists) {
                        // Verificamos que sea un token USDT y la transacción fue exitosa a nivel de API
                        if (tx.token_info.symbol === 'USDT' && tx.type === 'Transfer') {
                           const amount = parseFloat(ethers.utils.formatUnits(tx.value, 6)); // USDT en TRON tiene 6 decimales
                           console.log(`[Detector] Nuevo depósito TRON detectado para ${wallet.address}: ${amount} USDT. Hash: ${tx.transaction_id}`);
                           await PendingTx.create({
                               user: wallet.user,
                               chain: 'TRON',
                               txHash: tx.transaction_id,
                               fromAddress: tx.from,
                               toAddress: tx.to,
                               amount: amount,
                               status: 'PENDING',
                           });
                        }
                     }
                }
            }
        }
    } catch (error) {
        // Un error al escanear una dirección no debe detener todo el servicio.
        console.error(`[Detector] Error al escanear la dirección ${wallet.address} en ${wallet.chain}:`, error.message);
    }
};

/**
 * Función principal de detección. Obtiene todas las billeteras y las escanea en paralelo.
 */
const scanForAllWallets = async () => {
    console.log('[Watcher - Fase 1] Iniciando escaneo de todas las billeteras para detectar nuevos depósitos...');
    const allWallets = await CryptoWallet.find();
    if (allWallets.length === 0) {
        console.log('[Watcher - Fase 1] No hay billeteras en el sistema para escanear.');
        return;
    }
    // Usamos Promise.all para ejecutar los escaneos de forma concurrente y mejorar el rendimiento.
    await Promise.all(allWallets.map(wallet => scanAddressForDeposits(wallet)));
    console.log('[Watcher - Fase 1] Escaneo de detección completado.');
};

// --- FASE 2 y 3: VERIFICACIÓN Y ACREDITACIÓN ---

/**
 * Procesa las transacciones que están en estado 'PENDING' o 'CONFIRMED'.
 */
const processTransactions = async () => {
    console.log('[Watcher - Fase 2/3] Verificando transacciones pendientes y acreditando confirmadas...');
    const txsToProcess = await PendingTx.find({ status: { $in: ['PENDING', 'CONFIRMED'] } });

    for (const tx of txsToProcess) {
        try {
            if (tx.status === 'PENDING') {
                // --- FASE 2: VERIFICACIÓN ---
                let isConfirmed = false;
                if (tx.chain === 'BSC') {
                    const receipt = await bscProvider.getTransactionReceipt(tx.txHash);
                    if (receipt && receipt.status === 1) {
                        isConfirmed = true;
                    }
                } else if (tx.chain === 'TRON') {
                    // Se crea una instancia local de TronWeb para asegurar que sea sin estado.
                    const localTronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io', headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY } });
                    const txInfo = await localTronWeb.trx.getTransactionInfo(tx.txHash);
                    if (txInfo && txInfo.receipt && txInfo.receipt.result === 'SUCCESS') {
                        isConfirmed = true;
                    }
                }

                if (isConfirmed) {
                    tx.status = 'CONFIRMED';
                    console.log(`[Verifier] Transacción ${tx.txHash} (${tx.chain}) ha sido confirmada en la blockchain.`);
                }
                tx.lastChecked = new Date();
                await tx.save();

            } else if (tx.status === 'CONFIRMED') {
                // --- FASE 3: ACREDITACIÓN ---
                const user = await User.findById(tx.user);
                if (user) {
                    // La lógica de suma de saldo puede variar. Asegúrate que 'user.balance' es el campo correcto.
                    // Se utiliza 'Number()' para asegurar que ambos son tratados como números.
                    user.balance = (user.balance || 0) + Number(tx.amount);
                    await user.save();
                    
                    tx.status = 'CREDITED'; // Marcamos como acreditada para no volver a procesarla.
                    await tx.save();

                    console.log(`[Accreditor] ✅ ÉXITO: Acreditados ${tx.amount} USDT al usuario ${user._id}. Saldo actual: ${user.balance}`);
                } else {
                    console.error(`[Accreditor] ERROR CRÍTICO: No se encontró al usuario con ID ${tx.user} para la transacción ${tx.txHash}.`);
                    tx.status = 'ERROR_NO_USER'; // Marcar para investigación manual.
                    await tx.save();
                }
            }
        } catch (error) {
            console.error(`[Processor] Error al procesar tx ${tx.txHash}:`, error.message);
        }
    }
};

/**
 * Función principal que orquesta el ciclo de vida del watcher.
 */
const runWatcherCycle = async () => {
    console.log('--- [Watcher] Iniciando nuevo ciclo de operación ---');
    await scanForAllWallets();      // Primero, buscamos nuevas transacciones.
    await processTransactions();    // Luego, procesamos las que ya tenemos en cola.
    console.log('--- [Watcher] Ciclo de operación finalizado. Esperando al siguiente. ---');
};

/**
 * Inicia el servicio de vigilancia de blockchain.
 */
const startWatcher = () => {
    // El intervalo se aumenta a 60 segundos para dar tiempo a las llamadas API y evitar rate-limiting.
    const CYCLE_INTERVAL = 60000; // 60 segundos
    
    console.log(`[Watcher] ✅ Servicio de vigilancia de blockchain INICIADO. Ciclo de operación cada ${CYCLE_INTERVAL / 1000} segundos.`);
    
    // Ejecuta el primer ciclo inmediatamente al arrancar.
    runWatcherCycle();

    // Establece el ciclo para ejecuciones posteriores.
    setInterval(runWatcherCycle, CYCLE_INTERVAL);
};

module.exports = { startWatcher };