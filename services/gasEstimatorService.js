// RUTA: backend/services/gasEstimatorService.js (FASE "REMEDIATIO" - ENFOQUE EXCLUSIVO EN BSC)

const { ethers } = require('ethers');
const transactionService = require('./transactionService');
// [REMEDIATIO - REFACTOR] Importamos el servicio centralizado para la conexión RPC.
const blockchainService = require('./blockchainService');

const USDT_BSC_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const USDT_BSC_ABI = [
    'function transfer(address to, uint256 amount)',
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)'
];

// [REMEDIATIO - REFACTOR] Se elimina la creación de un proveedor local.
// const bscProvider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');

const MIN_BSC_GAS_PRICE_GWEI = 7;
const MIN_BSC_GAS_PRICE_WEI = ethers.BigNumber.from(MIN_BSC_GAS_PRICE_GWEI).mul(ethers.BigNumber.from(10).pow(9));

async function estimateBscSweepCost(fromAddress, usdtAmountToSweep) {
    try {
        // Usamos el proveedor centralizado del blockchainService.
        const usdtContract = new ethers.Contract(USDT_BSC_ADDRESS, USDT_BSC_ABI, blockchainService.provider);
        const decimals = await usdtContract.decimals();
        const amountInSmallestUnit = ethers.utils.parseUnits(usdtAmountToSweep.toString(), decimals);

        // La dirección de destino ahora se obtiene desde las variables de entorno para mayor seguridad.
        const destinationAddress = process.env.TREASURY_WALLET_ADDRESS;
        if (!destinationAddress) {
            throw new Error("TREASURY_WALLET_ADDRESS no está configurada.");
        }

        const estimatedGasLimit = await usdtContract.estimateGas.transfer(
            destinationAddress,
            amountInSmallestUnit,
            { from: fromAddress }
        );
        
        let gasPrice = await blockchainService.provider.getGasPrice();
        if (gasPrice.lt(MIN_BSC_GAS_PRICE_WEI)) {
            console.warn(`[GasEstimator-BSC] GasPrice obtenido (${ethers.utils.formatUnits(gasPrice, 'gwei')} Gwei) es bajo. Usando el mínimo de ${MIN_BSC_GAS_PRICE_GWEI} Gwei.`);
            gasPrice = MIN_BSC_GAS_PRICE_WEI;
        }

        const estimatedCost = estimatedGasLimit.mul(gasPrice);
        const costWithBuffer = estimatedCost.mul(110).div(100);
        const costInBnb = parseFloat(ethers.utils.formatEther(costWithBuffer));
        
        console.log(`[GasEstimator-BSC] Estimación para ${fromAddress}: Costo: ${costInBnb.toFixed(8)} BNB`);
        return costInBnb;

    } catch (error) {
        console.error(`[GasEstimator-BSC] Error al estimar gas para ${fromAddress}:`, error.message);
        return 0.002; // Fallback
    }
}

// [REMEDIATIO - LIMPIEZA] Se elimina la función estimateTronSweepCost y su exportación.
module.exports = {
    estimateBscSweepCost
};