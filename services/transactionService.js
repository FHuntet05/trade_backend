// RUTA: backend/services/transactionService.js (ELIMINACIÓN UMBRAL FIJO v35.21)

const { ethers } = require('ethers');
const TronWeb = require('tronweb').default.TronWeb;
const PendingTx = require('../models/pendingTxModel');

const USDT_TRON_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDT_BSC_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const USDT_BSC_ABI = ['function transfer(address, uint256)', 'function balanceOf(address) view returns (uint256)'];


function promiseWithTimeout(promise, ms, timeoutMessage = 'Operación excedió el tiempo de espera.') {
  const timeout = new Promise((_, reject) => {
    const id = setTimeout(() => { clearTimeout(id); reject(new Error(timeoutMessage)); }, ms);
  });
  return Promise.race([promise, timeout]);
}

// =========================================================================================
// ================ FUNCIÓN CENTRAL DE DERIVACIÓN DE WALLETS (SIN CAMBIOS) ===================
// =========================================================================================
const getCentralWallets = () => {
    if (!process.env.MASTER_SEED_PHRASE || !ethers.utils.isValidMnemonic(process.env.MASTER_SEED_PHRASE)) {
        throw new Error("CRITICAL: MASTER_SEED_PHRASE no está definida o es inválida.");
    }
    
    const masterNode = ethers.utils.HDNode.fromMnemonic(process.env.MASTER_SEED_PHRASE);

    const bscProvider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
    const bscNode = masterNode.derivePath(`m/44'/60'/0'/0/0`);
    const bscWallet = new ethers.Wallet(bscNode.privateKey, bscProvider);

    const tronNode = masterNode.derivePath(`m/44'/195'/0'/0/0`);
    const tronPrivateKey = tronNode.privateKey.slice(2); 
    const tronAddress = TronWeb.address.fromPrivateKey(tronPrivateKey);

    return {
        bscWallet,
        tronWallet: {
            privateKey: tronPrivateKey, 
            address: tronAddress
        }
    };
};

// =========================================================================================
// =================== FUNCIONES DE BARRIDO REFACTORIZADAS (MODIFICADO) =====================
// =========================================================================================
const sweepUsdtOnTronFromDerivedWallet = async (derivationIndex, destinationAddress) => {
  if (derivationIndex === undefined || !destinationAddress) throw new Error("Índice de derivación y dirección de destino son requeridos.");

  const masterNode = ethers.utils.HDNode.fromMnemonic(process.env.MASTER_SEED_PHRASE);
  const depositWalletNode = masterNode.derivePath(`m/44'/195'/${derivationIndex}'/0/0`);
  
  const depositWalletPrivateKey = depositWalletNode.privateKey.slice(2); 
  const depositWalletAddress = TronWeb.address.fromPrivateKey(depositWalletPrivateKey);
  
  const tempTronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io',
    headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY },
    privateKey: depositWalletPrivateKey
  });

  const usdtContract = await tempTronWeb.contract().at(USDT_TRON_ADDRESS);
  const balance = await promiseWithTimeout(usdtContract.balanceOf(depositWalletAddress).call(), 10000);
  const balanceBigNumber = ethers.BigNumber.from(balance.toString());

  if (balanceBigNumber.isZero()) throw new Error(`La wallet ${depositWalletAddress} no tiene saldo de USDT para barrer.`);
  
  console.log(`[SweepService] Iniciando barrido de ${ethers.utils.formatUnits(balanceBigNumber, 6)} USDT desde ${depositWalletAddress} hacia ${destinationAddress}`);
  
  try {
    const txHash = await promiseWithTimeout(usdtContract.transfer(destinationAddress, balanceBigNumber.toString()).send({ feeLimit: 150_000_000 }), 20000);
    console.log(`[SweepService] Barrido de ${depositWalletAddress} iniciado. Hash: ${txHash}`);
    return txHash;
  } catch(error) {
    console.error(`[SweepService] ERROR al barrer ${depositWalletAddress}:`, error);
    throw new Error(`Fallo en la transacción de barrido. Detalles: ${error.message}`);
  }
};

const sweepUsdtOnBscFromDerivedWallet = async (derivationIndex, destinationAddress) => {
    if (derivationIndex === undefined || !destinationAddress) throw new Error("Índice de derivación y dirección de destino son requeridos.");
    
    const bscProvider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
    const hdNode = ethers.utils.HDNode.fromMnemonic(process.env.MASTER_SEED_PHRASE);
    const depositWalletNode = hdNode.derivePath(`m/44'/60'/0'/0/${derivationIndex}`);
    const depositWallet = new ethers.Wallet(depositWalletNode.privateKey, bscProvider);
    const usdtContract = new ethers.Contract(USDT_BSC_ADDRESS, USDT_BSC_ABI, depositWallet);
    
    // --- INICIO DE MODIFICACIÓN v35.21 ---
    // ELIMINAR LA VERIFICACIÓN DE GAS HARDCODEADA
    // Ahora dependemos completamente de la estimación dinámica en adminController.js
    // const gasBalance = await bscProvider.getBalance(depositWallet.address);
    // if (gasBalance.lt(ethers.utils.parseEther("0.0015"))) throw new Error(`Fondos BNB insuficientes para el fee en la wallet ${depositWallet.address}.`);
    // --- FIN DE MODIFICACIÓN v35.21 ---
    
    const usdtBalance = await new ethers.Contract(USDT_BSC_ADDRESS, USDT_BSC_ABI, bscProvider).balanceOf(depositWallet.address);
    if (usdtBalance.isZero()) throw new Error(`La wallet ${depositWallet.address} no tiene saldo de USDT (BSC) para barrer.`);
    
    console.log(`[SweepService] Iniciando barrido de ${ethers.utils.formatUnits(usdtBalance, 18)} USDT (BSC) desde ${depositWallet.address}`);
    try {
        const tx = await usdtContract.transfer(destinationAddress, usdtBalance);
        await PendingTx.create({
            txHash: tx.hash,
            chain: 'BSC',
            type: 'USDT_SWEEP',
            metadata: new Map([['from', depositWallet.address], ['to', destinationAddress], ['amount', ethers.utils.formatUnits(usdtBalance, 18)]])
        });
        console.log(`[SweepService] Barrido de ${depositWallet.address} (BSC) iniciado. Hash: ${tx.hash}`);
        return tx.hash;
    } catch(error) {
        console.error(`[SweepService] ERROR al barrer ${depositWallet.address} (BSC):`, error);
        throw new Error(`Fallo en la transacción de barrido BSC. Detalles: ${error.message}`);
    }
};

const sendBscGas = async (toAddress, amountInBnb) => {
    const { bscWallet } = getCentralWallets();
    console.log(`[GasDispenser] Enviando ${amountInBnb} BNB desde ${bscWallet.address} a ${toAddress}`);
    try {
        const tx = { to: toAddress, value: ethers.utils.parseEther(amountInBnb.toString()) };
        const txResponse = await bscWallet.sendTransaction(tx);
        await PendingTx.create({
            txHash: txResponse.hash,
            chain: 'BSC',
            type: 'GAS_DISPATCH',
            metadata: new Map([['to', toAddress], ['amount', amountInBnb.toString()]])
        });
        await txResponse.wait();
        return txResponse.hash;
    } catch (error) {
        console.error(`[GasDispenser] ERROR enviando BNB a ${toAddress}:`, error);
        throw new Error(`Fallo al enviar BNB: ${error.reason || error.message}`);
    }
};

const sendTronTrx = async (toAddress, amountInTrx) => {
    const { tronWallet } = getCentralWallets();
    const localTronWeb = new TronWeb({
        fullHost: 'https://api.trongrid.io',
        headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY },
        privateKey: tronWallet.privateKey
    });

    console.log(`[GasDispenser] Enviando ${amountInTrx} TRX desde ${tronWallet.address} a ${toAddress}`);
    try {
        const amountInSun = localTronWeb.toSun(amountInTrx);
        const tx = await localTronWeb.transactionBuilder.sendTrx(toAddress, amountInSun, tronWallet.address);
        const signedTx = await localTronWeb.trx.sign(tx);
        const receipt = await localTronWeb.trx.sendRawTransaction(signedTx);
        
        if (!receipt.result) {
           throw new Error(`La transacción TRX falló con el mensaje: ${receipt.resMessage ? localTronWeb.toUtf8(receipt.resMessage) : 'Error desconocido'}`);
        }

        await PendingTx.create({
            txHash: receipt.txid,
            chain: 'TRON',
            type: 'GAS_DISPATCH',
            metadata: new Map([['to', toAddress], ['amount', amountInTrx.toString()]])
        });
        return receipt.txid;
    } catch (error) {
        console.error(`[GasDispenser] ERROR enviando TRX a ${toAddress}:`, error);
        throw new Error(`Fallo al enviar TRX: ${error.message}`);
    }
};

module.exports = {
  sweepUsdtOnTronFromDerivedWallet,
  sweepUsdtOnBscFromDerivedWallet,
  sendBscGas,
  sendTronTrx,
  getCentralWallets
};