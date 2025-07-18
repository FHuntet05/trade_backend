// RUTA: backend/services/transactionRescueService.js (NUEVO ARCHIVO)

const { ethers } = require('ethers');
const transactionService = require('./transactionService');
const PendingTx = require('../models/pendingTxModel');

const bscProvider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');

const GAS_PRICE_INCREASE_PERCENTAGE = 1; // Aumentar el precio del gas en un 1%

const _getTxAndSigner = async (txHash) => {
    const originalTx = await bscProvider.getTransaction(txHash);
    if (!originalTx) {
        throw new Error('La transacción original no se encontró en la red.');
    }
    if (originalTx.blockNumber) {
        throw new Error('La transacción ya ha sido confirmada y no puede ser modificada.');
    }
    const { bscWallet } = transactionService.getCentralWallets();
    if (originalTx.from.toLowerCase() !== bscWallet.address.toLowerCase()) {
        throw new Error('La transacción no fue enviada desde la billetera central del sistema.');
    }
    return { originalTx, signer: bscWallet };
};

const cancelBscTransaction = async (txHash) => {
    const { originalTx, signer } = await _getTxAndSigner(txHash);

    const newGasPrice = originalTx.gasPrice.mul(100 + GAS_PRICE_INCREASE_PERCENTAGE).div(100);

    console.log(`[RescueService] Intentando cancelar Tx ${txHash} con nonce ${originalTx.nonce}`);
    const cancelTx = await signer.sendTransaction({
        to: signer.address, // Enviando a nosotros mismos
        nonce: originalTx.nonce,
        gasLimit: 21000, // Límite de gas estándar para una transferencia de ETH/BNB
        gasPrice: newGasPrice,
        value: 0
    });

    // Actualizamos nuestro registro interno para reflejar la nueva tx de cancelación
    await PendingTx.findOneAndUpdate(
        { txHash: txHash, chain: 'BSC' },
        { status: 'FAILED', 'metadata.replacedBy': cancelTx.hash }
    );

    await PendingTx.create({
        txHash: cancelTx.hash,
        chain: 'BSC',
        type: 'GAS_DISPATCH', // Lo marcamos como una operación de gas
        status: 'PENDING',
        metadata: { operation: 'cancel', originalTx: txHash }
    });

    return { newTxHash: cancelTx.hash };
};

const speedUpBscTransaction = async (txHash) => {
    const { originalTx, signer } = await _getTxAndSigner(txHash);

    const newGasPrice = originalTx.gasPrice.mul(100 + GAS_PRICE_INCREASE_PERCENTAGE).div(100);
    
    console.log(`[RescueService] Intentando acelerar Tx ${txHash} con nonce ${originalTx.nonce}`);
    const speedUpTxData = {
        to: originalTx.to,
        nonce: originalTx.nonce,
        gasLimit: originalTx.gasLimit,
        gasPrice: newGasPrice,
        value: originalTx.value,
        data: originalTx.data
    };
    
    const speedUpTx = await signer.sendTransaction(speedUpTxData);

    await PendingTx.findOneAndUpdate(
        { txHash: txHash, chain: 'BSC' },
        { status: 'FAILED', 'metadata.replacedBy': speedUpTx.hash }
    );
    
    const originalPendingTx = await PendingTx.findOne({ txHash: txHash, chain: 'BSC' });
    
    await PendingTx.create({
        txHash: speedUpTx.hash,
        chain: 'BSC',
        type: originalPendingTx.type,
        status: 'PENDING',
        metadata: { ...originalPendingTx.metadata, operation: 'speedup', originalTx: txHash }
    });

    return { newTxHash: speedUpTx.hash };
};

module.exports = {
    cancelBscTransaction,
    speedUpBscTransaction
};