// RUTA: backend/services/blockchainWatcherService.js (NUEVO ARCHIVO)

const { ethers } = require('ethers');
const TronWeb = require('tronweb').default.TronWeb;
const PendingTx = require('../models/pendingTxModel');

const bscProvider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
const tronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io', headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY } });

const checkPendingTransactions = async () => {
  console.log('[Watcher] Verificando transacciones pendientes...');
  const pendingTxs = await PendingTx.find({ status: 'PENDING' });

  for (const tx of pendingTxs) {
    try {
      tx.lastChecked = new Date();
      if (tx.chain === 'BSC') {
        const receipt = await bscProvider.getTransactionReceipt(tx.txHash);
        if (receipt) {
          tx.status = receipt.status === 1 ? 'CONFIRMED' : 'FAILED';
          console.log(`[Watcher] BSC Tx ${tx.txHash} actualizada a ${tx.status}`);
        }
      } else if (tx.chain === 'TRON') {
        const txInfo = await tronWeb.trx.getTransactionInfo(tx.txHash);
        if (txInfo && txInfo.receipt) {
            tx.status = txInfo.receipt.result === 'SUCCESS' ? 'CONFIRMED' : 'FAILED';
            console.log(`[Watcher] TRON Tx ${tx.txHash} actualizada a ${tx.status}`);
        }
      }
      await tx.save();
    } catch (error) {
      console.error(`[Watcher] Error al verificar tx ${tx.txHash}:`, error.message);
    }
  }
};

const startWatcher = () => {
  console.log('[Watcher] ✅ Servicio de vigilancia de blockchain iniciado. Verificando cada 30 segundos.');
  // Ejecutar una vez al inicio
  checkPendingTransactions();
  // Y luego periódicamente
  setInterval(checkPendingTransactions, 30000); // 30 segundos
};

module.exports = { startWatcher };