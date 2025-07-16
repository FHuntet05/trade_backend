// backend/services/transactionService.js (VERSIÓN v15.1 - CON LÓGICA DE BARRIDO)
const { ethers } = require('ethers');
const TronWeb = require('tronweb');

const bscProvider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY },
});
const USDT_TRON_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

let hotWallet;

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
  const balance = await usdtContract.balanceOf(depositWalletAddress).call();
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
    const txHash = await tempContract.transfer(destinationAddress, balanceBigNumber.toString()).send({ feeLimit: 150_000_000 });
    console.log(`[SweepService] Barrido de ${depositWalletAddress} iniciado. Hash: ${txHash}`);
    return txHash;
  } catch(error) {
    console.error(`[SweepService] ERROR al barrer ${depositWalletAddress}:`, error);
    throw new Error(`Fallo en la transacción de barrido. Verifique que la wallet de depósito tenga suficiente TRX para el fee. Detalles: ${error.message}`);
  }
};

const sendUsdtOnTron = async (toAddress, amount) => {
  initializeHotWallet();
  try {
    const usdtContract = await tronWeb.contract().at(USDT_TRON_ADDRESS);
    const amountInSun = ethers.utils.parseUnits(amount.toString(), 6);
    const txHash = await usdtContract.transfer(toAddress, amountInSun.toString()).send({ feeLimit: 150_000_000, shouldPoll: false });
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