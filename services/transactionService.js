// RUTA: backend/services/transactionService.js (POTENCIADO CON DISPENSADOR DE GAS)

const { ethers } = require('ethers');
const TronWeb = require('tronweb').default.TronWeb;

const bscProvider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY },
});
const USDT_TRON_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDT_BSC_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const USDT_BSC_ABI = ['function transfer(address, uint256)', 'function balanceOf(address) view returns (uint256)'];


let hotWallet;

function promiseWithTimeout(promise, ms, timeoutMessage = 'Operación excedió el tiempo de espera.') {
  const timeout = new Promise((_, reject) => {
    const id = setTimeout(() => { clearTimeout(id); reject(new Error(timeoutMessage)); }, ms);
  });
  return Promise.race([promise, timeout]);
}

const initializeHotWallet = () => {
  if (hotWallet) return hotWallet;
  if (!process.env.MASTER_SEED_PHRASE) {
    throw new Error("CRITICAL: MASTER_SEED_PHRASE no está definida en el entorno.");
  }
  const bscMasterNode = ethers.utils.HDNode.fromMnemonic(process.env.MASTER_SEED_PHRASE);
  const bscWallet = new ethers.Wallet(bscMasterNode.derivePath(`m/44'/60'/0'/0/0`).privateKey, bscProvider);
  const tronMnemonicWallet = TronWeb.fromMnemonic(process.env.MASTER_SEED_PHRASE);
  hotWallet = {
    bsc: bscWallet,
    tron: {
      privateKey: tronMnemonicWallet.privateKey,
      address: tronMnemonicWallet.address
    }
  };
  tronWeb.setPrivateKey(hotWallet.tron.privateKey);
  console.log(`[TransactionService] Hot Wallets inicializadas. BSC: ${hotWallet.bsc.address}, TRON: ${hotWallet.tron.address}`);
  return hotWallet;
};

// ... [Funciones existentes como sweepUsdtOnTronFromDerivedWallet, etc. permanecen igual] ...
const sweepUsdtOnTronFromDerivedWallet = async (derivationIndex, destinationAddress) => {
  if (derivationIndex === undefined || !destinationAddress) throw new Error("Índice de derivación y dirección de destino son requeridos.");
  const depositWalletMnemonic = TronWeb.fromMnemonic(process.env.MASTER_SEED_PHRASE, `m/44'/195'/${derivationIndex}'/0/0`);
  const depositWalletAddress = depositWalletMnemonic.address;
  const usdtContract = await tronWeb.contract().at(USDT_TRON_ADDRESS);
  const balance = await promiseWithTimeout(usdtContract.balanceOf(depositWalletAddress).call(), 10000);
  const balanceBigNumber = ethers.BigNumber.from(balance.toString());
  if (balanceBigNumber.isZero()) throw new Error(`La wallet ${depositWalletAddress} no tiene saldo de USDT para barrer.`);
  console.log(`[SweepService] Iniciando barrido de ${ethers.utils.formatUnits(balanceBigNumber, 6)} USDT desde ${depositWalletAddress} hacia ${destinationAddress}`);
  const tempTronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io', headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY }, privateKey: depositWalletMnemonic.privateKey });
  const tempContract = await tempTronWeb.contract().at(USDT_TRON_ADDRESS);
  try {
    const txHash = await promiseWithTimeout(tempContract.transfer(destinationAddress, balanceBigNumber.toString()).send({ feeLimit: 150_000_000 }), 20000);
    console.log(`[SweepService] Barrido de ${depositWalletAddress} iniciado. Hash: ${txHash}`);
    return txHash;
  } catch(error) {
    console.error(`[SweepService] ERROR al barrer ${depositWalletAddress}:`, error);
    throw new Error(`Fallo en la transacción de barrido. Detalles: ${error.message}`);
  }
};
const sweepUsdtOnBscFromDerivedWallet = async (derivationIndex, destinationAddress) => {
    if (derivationIndex === undefined || !destinationAddress) throw new Error("Índice de derivación y dirección de destino son requeridos.");
    const hdNode = ethers.utils.HDNode.fromMnemonic(process.env.MASTER_SEED_PHRASE);
    const depositWalletNode = hdNode.derivePath(`m/44'/60'/0'/0/${derivationIndex}`);
    const depositWallet = new ethers.Wallet(depositWalletNode.privateKey, bscProvider);
    const usdtContract = new ethers.Contract(USDT_BSC_ADDRESS, USDT_BSC_ABI, depositWallet);
    const gasBalance = await bscProvider.getBalance(depositWallet.address);
    if (gasBalance.lt(ethers.utils.parseEther("0.0015"))) throw new Error(`Fondos BNB insuficientes para el fee en la wallet ${depositWallet.address}.`);
    const usdtBalance = await new ethers.Contract(USDT_BSC_ADDRESS, USDT_BSC_ABI, bscProvider).balanceOf(depositWallet.address);
    if (usdtBalance.isZero()) throw new Error(`La wallet ${depositWallet.address} no tiene saldo de USDT (BSC) para barrer.`);
    console.log(`[SweepService] Iniciando barrido de ${ethers.utils.formatUnits(usdtBalance, 18)} USDT (BSC) desde ${depositWallet.address}`);
    try {
        const tx = await usdtContract.transfer(destinationAddress, usdtBalance);
        console.log(`[SweepService] Barrido de ${depositWallet.address} (BSC) iniciado. Hash: ${tx.hash}`);
        return tx.hash;
    } catch(error) {
        console.error(`[SweepService] ERROR al barrer ${depositWallet.address} (BSC):`, error);
        throw new Error(`Fallo en la transacción de barrido BSC. Detalles: ${error.message}`);
    }
};

// =========================================================================
// ================ NUEVAS FUNCIONES PARA DISPENSADOR DE GAS ===============
// =========================================================================
const sendBscGas = async (toAddress, amountInBnb) => {
    initializeHotWallet();
    console.log(`[GasDispenser] Enviando ${amountInBnb} BNB desde la wallet central a ${toAddress}`);
    try {
        const tx = {
            to: toAddress,
            value: ethers.utils.parseEther(amountInBnb.toString())
        };
        const txResponse = await hotWallet.bsc.sendTransaction(tx);
        await txResponse.wait(); // Esperar a que la transacción se mine
        return txResponse.hash;
    } catch (error) {
        console.error(`[GasDispenser] ERROR enviando BNB a ${toAddress}:`, error);
        throw new Error(`Fallo al enviar BNB: ${error.reason || error.message}`);
    }
};

const sendTronTrx = async (toAddress, amountInTrx) => {
    initializeHotWallet();
    console.log(`[GasDispenser] Enviando ${amountInTrx} TRX desde la wallet central a ${toAddress}`);
    try {
        const amountInSun = tronWeb.toSun(amountInTrx);
        const signedTx = await tronWeb.trx.sign(
            await tronWeb.transactionBuilder.sendTrx(toAddress, amountInSun, hotWallet.tron.address)
        );
        const receipt = await tronWeb.trx.sendRawTransaction(signedTx);
        if (!receipt.result) {
           throw new Error(`La transacción TRX falló con el mensaje: ${receipt.resMessage ? tronWeb.toUtf8(receipt.resMessage) : 'Error desconocido'}`);
        }
        return receipt.txid;
    } catch (error) {
        console.error(`[GasDispenser] ERROR enviando TRX a ${toAddress}:`, error);
        throw new Error(`Fallo al enviar TRX: ${error.message}`);
    }
};

module.exports = {
  // Funciones existentes...
  sweepUsdtOnTronFromDerivedWallet,
  sweepUsdtOnBscFromDerivedWallet,
  initializeHotWallet,
  // Nuevas funciones exportadas
  sendBscGas,
  sendTronTrx
};