// RUTA: backend/services/gasEstimatorService.js (CORREGIDO v35.3)
// VERSIÓN: "Parche de Dirección Cero"
// DESCRIPCIÓN: Se corrige el error 'UNPREDICTABLE_GAS_LIMIT' al simular la transferencia a una dirección válida.

const { ethers } = require('ethers');
const TronWeb = require('tronweb').default.TronWeb;
// --- INICIO DE MODIFICACIÓN v35.3 ---
// 1. Se importa el transactionService para poder acceder a la billetera central.
const transactionService = require('./transactionService');
// --- FIN DE MODIFICACIÓN v35.3 ---

const USDT_BSC_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const USDT_TRON_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

const USDT_BSC_ABI = [
    'function transfer(address to, uint256 amount)',
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)'
];

const bscProvider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');

async function estimateBscSweepCost(fromAddress, usdtAmountToSweep) {
    try {
        const usdtContract = new ethers.Contract(USDT_BSC_ADDRESS, USDT_BSC_ABI, bscProvider);
        const decimals = await usdtContract.decimals();
        const amountInSmallestUnit = ethers.utils.parseUnits(usdtAmountToSweep.toString(), decimals);

        // --- INICIO DE MODIFICACIÓN v35.3 ---
        // 2. Se obtiene la dirección de la billetera central de BSC.
        const { bscWallet } = transactionService.getCentralWallets();
        const destinationAddress = bscWallet.address;
        // --- FIN DE MODIFICACIÓN v35.3 ---

        // Se estima el 'gasLimit' que consumiría la transferencia.
        // 3. Se usa la dirección de destino válida en lugar de la dirección cero.
        const estimatedGasLimit = await usdtContract.estimateGas.transfer(
            destinationAddress, // <-- CORRECCIÓN CLAVE
            amountInSmallestUnit,
            { from: fromAddress }
        );
        
        const gasPrice = await bscProvider.getGasPrice();
        const estimatedCost = estimatedGasLimit.mul(gasPrice);
        const costWithBuffer = estimatedCost.mul(115).div(100);
        const costInBnb = parseFloat(ethers.utils.formatEther(costWithBuffer));
        
        console.log(`[GasEstimator-BSC] Estimación para ${fromAddress}: GasLimit=${estimatedGasLimit}, GasPrice=${ethers.utils.formatUnits(gasPrice, 'gwei')} Gwei -> Costo: ${costInBnb.toFixed(6)} BNB`);
        
        return costInBnb;

    } catch (error) {
        // El error ahora podría ser legítimo (ej. la wallet no tiene fondos), por lo que el fallback es importante.
        console.error(`[GasEstimator-BSC] Error al estimar gas para ${fromAddress}:`, error.message);
        return 0.002;
    }
}

async function estimateTronSweepCost(fromAddress, usdtAmountToSweep) {
    try {
        const tronWeb = new TronWeb({
            fullHost: 'https://api.trongrid.io',
            headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY }
        });

        // --- INICIO DE MODIFICACIÓN v35.3 (Aplicado también a TRON por consistencia) ---
        const { tronWallet } = transactionService.getCentralWallets();
        const destinationAddress = tronWallet.address;
        // --- FIN DE MODIFICACIÓN v35.3 ---

        const usdtContract = await tronWeb.contract().at(USDT_TRON_ADDRESS);
        const decimals = await usdtContract.decimals().call();
        const amountInSmallestUnit = new tronWeb.BigNumber(usdtAmountToSweep).multipliedBy(Math.pow(10, decimals));
        
        const transactionObject = await tronWeb.transactionBuilder.triggerConstantContractQuery(
            USDT_TRON_ADDRESS,
            'transfer(address,uint256)',
            {},
            [
                { type: 'address', value: tronWeb.address.toHex(destinationAddress) }, // <-- CORRECCIÓN CLAVE
                { type: 'uint256', value: amountInSmallestUnit.toString(10) }
            ],
            fromAddress
        );

        const energyUsed = transactionObject.energy_used;

        if (!energyUsed || energyUsed === 0) {
            console.warn(`[GasEstimator-TRON] No se pudo estimar la energía para ${fromAddress}. Usando valor por defecto.`);
            return 30;
        }

        const chainParams = await tronWeb.trx.getChainParameters();
        const energyFeeParam = chainParams.find(p => p.key === 'getEnergyFee');
        const sunPerEnergyUnit = energyFeeParam ? energyFeeParam.value : 420;

        const costInSun = energyUsed * sunPerEnergyUnit;
        const costInSunWithBuffer = Math.ceil(costInSun * 1.10);
        const costInTrx = tronWeb.fromSun(costInSunWithBuffer);
        
        console.log(`[GasEstimator-TRON] Estimación para ${fromAddress}: Energy=${energyUsed} -> Costo: ${costInTrx.toFixed(4)} TRX`);
        
        return parseFloat(costInTrx);

    } catch (error) {
        console.error(`[GasEstimator-TRON] Error al estimar TRX para ${fromAddress}:`, error.message);
        return 30;
    }
}

module.exports = {
    estimateBscSweepCost,
    estimateTronSweepCost
};