// RUTA: backend/services/gasEstimatorService.js (PISO MÍNIMO GAS PRICE v35.21)
// VERSIÓN: "Precio Realista"
// DESCRIPCIÓN: Asegura que el gasPrice para la estimación de BSC no sea irrealmente bajo (mínimo de 5 Gwei).

const { ethers } = require('ethers');
const TronWeb = require('tronweb').default.TronWeb;
const transactionService = require('./transactionService');

const USDT_BSC_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const USDT_TRON_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

const USDT_BSC_ABI = [
    'function transfer(address to, uint256 amount)',
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)'
];

const bscProvider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');

// --- NUEVA CONSTANTE: PRECIO MÍNIMO DE GAS EN GWEI PARA BSC ---
const MIN_BSC_GAS_PRICE_GWEI = 2; // Un precio de gas realista para BSC (5 Gwei)
const MIN_BSC_GAS_PRICE_WEI = ethers.BigNumber.from(MIN_BSC_GAS_PRICE_GWEI).mul(ethers.BigNumber.from(10).pow(9)); // Convertir a WEI

async function estimateBscSweepCost(fromAddress, usdtAmountToSweep) {
    try {
        const usdtContract = new ethers.Contract(USDT_BSC_ADDRESS, USDT_BSC_ABI, bscProvider);
        const decimals = await usdtContract.decimals();
        const amountInSmallestUnit = ethers.utils.parseUnits(usdtAmountToSweep.toString(), decimals);

        const { bscWallet } = transactionService.getCentralWallets();
        const destinationAddress = bscWallet.address;

        const estimatedGasLimit = await usdtContract.estimateGas.transfer(
            destinationAddress,
            amountInSmallestUnit,
            { from: fromAddress }
        );
        
        let gasPrice = await bscProvider.getGasPrice();
        // --- INICIO DE MODIFICACIÓN v35.21 ---
        // Asegurar que el gasPrice no sea menor que el mínimo realista
        if (gasPrice.lt(MIN_BSC_GAS_PRICE_WEI)) {
            console.warn(`[GasEstimator-BSC] GasPrice obtenido (${ethers.utils.formatUnits(gasPrice, 'gwei')} Gwei) es menor que el mínimo configurado (${MIN_BSC_GAS_PRICE_GWEI} Gwei). Usando el mínimo.`);
            gasPrice = MIN_BSC_GAS_PRICE_WEI;
        }
        // --- FIN DE MODIFICACIÓN v35.21 ---

        const estimatedCost = estimatedGasLimit.mul(gasPrice);
        
        // Búfer de seguridad del 10%.
        const costWithBuffer = estimatedCost.mul(110).div(100); 
        
        const costInBnb = parseFloat(ethers.utils.formatEther(costWithBuffer));
        
        console.log(`[GasEstimator-BSC] Estimación para ${fromAddress}: GasLimit=${estimatedGasLimit}, GasPrice=${ethers.utils.formatUnits(gasPrice, 'gwei')} Gwei -> Costo: ${costInBnb.toFixed(8)} BNB`);
        
        return costInBnb;

    } catch (error) {
        console.error(`[GasEstimator-BSC] Error al estimar gas para ${fromAddress}:`, error.message);
        // El fallback de 0.002 BNB es un valor seguro si la estimación falla.
        return 0.002;
    }
}

async function estimateTronSweepCost(fromAddress, usdtAmountToSweep) {
    try {
        const tronWeb = new TronWeb({
            fullHost: 'https://api.trongrid.io',
            headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY }
        });

        const { tronWallet } = transactionService.getCentralWallets();
        const destinationAddress = tronWallet.address;

        const usdtContract = await tronWeb.contract().at(USDT_TRON_ADDRESS);
        const decimals = await usdtContract.decimals().call();
        const amountInSmallestUnit = new tronWeb.BigNumber(usdtAmountToSweep).multipliedBy(Math.pow(10, decimals));
        
        const transactionObject = await tronWeb.transactionBuilder.triggerConstantContractQuery(
            USDT_TRON_ADDRESS,
            'transfer(address,uint256)',
            {},
            [
                { type: 'address', value: tronWeb.address.toHex(destinationAddress) },
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
        
        // Búfer de seguridad del 10%.
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