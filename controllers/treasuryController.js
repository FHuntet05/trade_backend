// backend/controllers/treasuryController.js (CORREGIDO PARA ETHERS V5)

const { ethers } = require('ethers'); // Importamos ethers completo para acceder a sus sub-módulos
const TronWeb = require('tronweb');
const User = require('../models/userModel'); // Para validar la contraseña del admin

// --- Configuración de Redes ---
// CAMBIO 1: Sintaxis de Ethers v5 para inicializar el proveedor.
const bscProvider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');

const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
  headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY },
});

// --- Direcciones de Contratos de Tokens ---
const USDT_TRON_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDT_BSC_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';

// La función 'fromPhrase' de Ethers v5 está en 'ethers.Wallet', no 'ethers.HDNodeWallet'.
// La lógica actual ya era compatible con v5, así que no se necesita cambio aquí.
const getHotWallets = () => {
    // CAMBIO 2: Ethers v5 utiliza ethers.Wallet.fromMnemonic, no fromPhrase.
    const bscWallet = ethers.Wallet.fromMnemonic(process.env.MASTER_SEED_PHRASE, `m/44'/60'/0'/0/0`);
    const tronWallet = TronWeb.fromMnemonic(process.env.MASTER_SEED_PHRASE, `m/44'/195'/0'/0/0`);
    return {
        bsc: { address: bscWallet.address, privateKey: bscWallet.privateKey },
        tron: { address: tronWallet.address, privateKey: tronWallet.privateKey }
    };
};

/** @desc Obtener los saldos de las hot wallets */
const getHotWalletBalances = async (req, res) => {
    try {
        const wallets = getHotWallets();

        const usdtTronContract = await tronWeb.contract().at(USDT_TRON_ADDRESS);
        const bscSigner = new ethers.Wallet(wallets.bsc.privateKey, bscProvider);
        const usdtBscContract = new ethers.Contract(USDT_BSC_ADDRESS, ['function balanceOf(address) view returns (uint256)'], bscSigner);
        
        const [
            bnbBalance,
            usdtBscBalance,
            trxBalance,
            usdtTronBalance
        ] = await Promise.all([
            bscProvider.getBalance(wallets.bsc.address),
            usdtBscContract.balanceOf(wallets.bsc.address),
            tronWeb.trx.getBalance(wallets.tron.address),
            usdtTronContract.balanceOf(wallets.tron.address).call()
        ]);

        // CAMBIO 3: Usamos ethers.utils.formatEther en v5.
        // CAMBIO 4: Usamos ethers.utils.formatUnits en v5.
        res.json({
            BNB: ethers.utils.formatEther(bnbBalance),
            USDT_BSC: ethers.utils.formatUnits(usdtBscBalance, 6), // USDT en BSC suele tener 6 decimales
            TRX: tronWeb.fromSun(trxBalance),
            USDT_TRON: (usdtTronBalance.toNumber() / 1e6).toString() // USDT en Tron tiene 6 decimales
        });

    } catch (error) {
        console.error("Error al obtener saldos de hot wallets:", error);
        res.status(500).json({ message: "Error al consultar los saldos." });
    }
};

/** @desc Ejecutar un barrido de una hot wallet */
const sweepWallet = async (req, res) => {
    const { currency, destinationAddress, adminPassword } = req.body;

    if (!currency || !destinationAddress || !adminPassword) {
        return res.status(400).json({ message: 'Moneda, dirección de destino y contraseña son requeridos.' });
    }
    
    try {
        const adminUser = await User.findById(req.user.id).select('+password');
        const isMatch = await adminUser.matchPassword(adminPassword);
        if (!isMatch) {
            return res.status(401).json({ message: 'Contraseña de administrador incorrecta.' });
        }

        const wallets = getHotWallets();
        let txHash;

        if (currency === 'BNB' || currency === 'USDT_BSC') {
            const bscSigner = new ethers.Wallet(wallets.bsc.privateKey, bscProvider);
            if (currency === 'BNB') {
                const balance = await bscProvider.getBalance(wallets.bsc.address);
                // CAMBIO 5: En v5, getFeeData() no existe de esta forma. Usamos getGasPrice().
                const gasPrice = await bscProvider.getGasPrice();
                const gasLimit = ethers.BigNumber.from('21000'); // Usar BigNumber de Ethers v5
                const gasCost = gasPrice.mul(gasLimit);
                
                if (balance.lte(gasCost)) { // Usar .lte() para comparar BigNumbers
                    throw new Error('Saldo BNB insuficiente para cubrir el gas.');
                }
                const amountToSend = balance.sub(gasCost); // Usar .sub() para restar BigNumbers
                const tx = await bscSigner.sendTransaction({ to: destinationAddress, value: amountToSend });
                txHash = tx.hash;
            } else { // USDT_BSC
                const usdtContract = new ethers.Contract(USDT_BSC_ADDRESS, ['function transfer(address, uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)'], bscSigner);
                const balance = await usdtContract.balanceOf(wallets.bsc.address);
                if (balance.isZero()) throw new Error('No hay saldo USDT (BSC) para barrer.');
                const tx = await usdtContract.transfer(destinationAddress, balance);
                txHash = tx.hash;
            }
        } else if (currency === 'TRX' || currency === 'USDT_TRON') {
            // La lógica de TronWeb no depende de Ethers, así que no hay cambios aquí.
            tronWeb.setPrivateKey(wallets.tron.privateKey);
            if (currency === 'TRX') {
                const balance = await tronWeb.trx.getBalance(wallets.tron.address);
                const amountToSend = balance - 1500000;
                if (amountToSend <= 0) throw new Error('Saldo TRX insuficiente para cubrir el gas.');
                const tradeobj = await tronWeb.transactionBuilder.sendTrx(destinationAddress, amountToSend, wallets.tron.address);
                const signedtxn = await tronWeb.trx.sign(tradeobj);
                const receipt = await tronWeb.trx.sendRawTransaction(signedtxn);
                txHash = receipt.txid;
            } else { // USDT_TRON
                const usdtContract = await tronWeb.contract().at(USDT_TRON_ADDRESS);
                const balance = await usdtContract.balanceOf(wallets.tron.address).call();
                if (balance.toNumber() <= 0) throw new Error('No hay saldo USDT (TRON) para barrer.');
                const tx = await usdtContract.transfer(destinationAddress, balance).send();
                txHash = tx;
            }
        } else {
            return res.status(400).json({ message: 'Moneda no soportada para barrido.' });
        }

        res.json({ message: `Barrido de ${currency} iniciado.`, transactionHash: txHash });

    } catch (error) {
        console.error(`Error durante el barrido de ${currency}:`, error);
        res.status(500).json({ message: error.message || 'Error al ejecutar el barrido.' });
    }
};

module.exports = {
    getHotWalletBalances,
    sweepWallet,
};