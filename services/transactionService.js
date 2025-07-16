// backend/services/transactionService.js (VERSIÓN v17.2 - BLINDADA CONTRA BLOQUEOS)
const { ethers } = require('ethers');
const TronWeb = require('tronweb').default.TronWeb;

const bscProvider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY },
});
const USDT_TRON_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

let hotWallet;

/**
 * @desc    Envuelve una promesa en una carrera contra un temporizador de timeout.
 * @param   {Promise} promise - La promesa a ejecutar (ej. una llamada a la blockchain).
 * @param   {number} ms - El tiempo de espera en milisegundos.
 * @returns {Promise} - La promesa original o un error de timeout.
 */
function promiseWithTimeout(promise, ms, timeoutMessage = 'Operación excedió el tiempo de espera.') {
  const timeout = new Promise((_, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      reject(new Error(timeoutMessage));
    }, ms);
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

const sweepUsdtOnTronFromDerivedWallet = async (derivationIndex, destinationAddress) => {
  if (derivationIndex === undefined || !destinationAddress) {
    throw new Error("Índice de derivación y dirección de destino son requeridos.");
  }
  const depositWalletMnemonic = TronWeb.fromMnemonic(process.env.MASTER_SEED_PHRASE, `m/44'/195'/${derivationIndex}'/0/0`);
  const depositWalletAddress = depositWalletMnemonic.address;
  const usdtContract = await tronWeb.contract().at(USDT_TRON_ADDRESS);
  
  // CORRECCIÓN: Envolvemos la llamada a la blockchain con un timeout de 10 segundos.
  const balanceCall = usdtContract.balanceOf(depositWalletAddress).call();
  const balance = await promiseWithTimeout(balanceCall, 10000, 'Timeout al consultar el saldo de la wallet de depósito.');

  const balanceBigNumber = ethers.BigNumber.from(balance.toString());
  if (balanceBigNumber.isZero()) {
    throw new Error(`La wallet ${depositWalletAddress} no tiene saldo de USDT para barrer.`);
  }
  console.log(`[SweepService] Iniciando barrido de ${ethers.utils.formatUnits(balanceBigNumber, 6)} USDT desde ${depositWalletAddress} hacia ${destinationAddress}`);
  
  const tempTronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io',
    headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY },
    privateKey: depositWalletMnemonic.privateKey,
  });
  const tempContract = await tempTronWeb.contract().at(USDT_TRON_ADDRESS);
  try {
    // CORRECCIÓN: Envolvemos el envío de la transacción con un timeout de 20 segundos.
    const transferSend = tempContract.transfer(destinationAddress, balanceBigNumber.toString()).send({ feeLimit: 150_000_000 });
    const txHash = await promiseWithTimeout(transferSend, 20000, 'Timeout al enviar la transacción de barrido.');
    
    console.log(`[SweepService] Barrido de ${depositWalletAddress} iniciado. Hash: ${txHash}`);
    return txHash;
  } catch(error) {
    console.error(`[SweepService] ERROR al barrer ${depositWalletAddress}:`, error);
    throw new Error(`Fallo en la transacción de barrido. Detalles: ${error.message}`);
  }
};

const sendUsdtOnTron = async (toAddress, amount) => {
  initializeHotWallet();
  try {
    const usdtContract = await tronWeb.contract().at(USDT_TRON_ADDRESS);
    const amountInSun = ethers.utils.parseUnits(amount.toString(), 6);
    
    // CORRECCIÓN: Envolvemos el envío de la transacción con un timeout de 20 segundos.
    const transferSend = usdtContract.transfer(toAddress, amountInSun.toString()).send({ feeLimit: 150_000_000, shouldPoll: false });
    const txHash = await promiseWithTimeout(transferSend, 20000, 'Timeout al enviar la transacción de retiro.');

    console.log(`[TransactionService] Envío de ${amount} USDT (TRON) a ${toAddress} iniciado. Hash: ${txHash}`);
    return txHash;
  } catch (error) {
    console.error(`[TransactionService] ERROR al enviar USDT (TRON):`, error);
    throw new Error(`Fallo en la transacción TRON: ${error.details || error.message}`);
  }
};

module.exports = {
  sendUsdtOnTron,
  sweepUsdtOnTronFromDerivedWallet,
  initializeHotWallet
};