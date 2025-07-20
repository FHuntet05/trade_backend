// RUTA: backend/services/gasEstimatorService.js (NUEVO ARCHIVO)
// VERSIÓN: v35.1 - "Gestión de Gas Dinámica"
// DESCRIPCIÓN: Servicio centralizado para calcular los costos de transacción de barrido en tiempo real.

const { ethers } = require('ethers');
const TronWeb = require('tronweb').default.TronWeb;

// --- CONFIGURACIÓN DE CONSTANTES Y CONTRATOS ---
const USDT_BSC_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const USDT_TRON_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

// ABI mínimo necesario para las operaciones de estimación y transferencia de USDT en BSC
const USDT_BSC_ABI = [
    'function transfer(address to, uint256 amount)',
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)'
];

// Instancia del proveedor de BSC. Se puede reutilizar.
const bscProvider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');

// --- ESTIMADOR PARA LA RED BINANCE SMART CHAIN (BSC) ---

/**
 * Estima el costo en BNB para barrer (transferir) el saldo completo de USDT de una dirección.
 * @param {string} fromAddress - La dirección de la wallet de depósito que se va a barrer.
 * @param {number} usdtAmountToSweep - La cantidad de USDT a barrer (para la simulación).
 * @returns {Promise<number>} El costo estimado de la transacción en BNB.
 */
async function estimateBscSweepCost(fromAddress, usdtAmountToSweep) {
    try {
        // Se crea una instancia del contrato USDT para interactuar con él.
        const usdtContract = new ethers.Contract(USDT_BSC_ADDRESS, USDT_BSC_ABI, bscProvider);
        
        // Obtenemos los decimales del token para formatear la cantidad correctamente.
        const decimals = await usdtContract.decimals();
        const amountInSmallestUnit = ethers.utils.parseUnits(usdtAmountToSweep.toString(), decimals);

        // --- Simulación de la Transacción ---
        // Se estima el 'gasLimit' que consumiría una transferencia desde 'fromAddress' a una dirección temporal.
        // El 'from' en la llamada es crucial para que ethers.js simule correctamente los accesos de storage.
        const estimatedGasLimit = await usdtContract.estimateGas.transfer(
            ethers.constants.AddressZero, // El destinatario es irrelevante para la estimación del costo.
            amountInSmallestUnit,
            { from: fromAddress } // ¡IMPORTANTE! Simula la transacción como si la enviara 'fromAddress'.
        );
        
        // Obtenemos el precio del gas actual de la red.
        const gasPrice = await bscProvider.getGasPrice();
        
        // Calculamos el costo base (límite de gas * precio del gas).
        const estimatedCost = estimatedGasLimit.mul(gasPrice);
        
        // --- Búfer de Seguridad ---
        // Añadimos un 15% de búfer para cubrir fluctuaciones del precio del gas.
        const costWithBuffer = estimatedCost.mul(115).div(100);
        
        // Convertimos el resultado final a formato legible en BNB (ej. "0.0015").
        const costInBnb = parseFloat(ethers.utils.formatEther(costWithBuffer));
        
        console.log(`[GasEstimator-BSC] Estimación para ${fromAddress}: GasLimit=${estimatedGasLimit}, GasPrice=${ethers.utils.formatUnits(gasPrice, 'gwei')} Gwei -> Costo: ${costInBnb.toFixed(6)} BNB`);
        
        return costInBnb;

    } catch (error) {
        console.error(`[GasEstimator-BSC] Error al estimar gas para ${fromAddress}:`, error.message);
        // Si la estimación falla (por ejemplo, la wallet no tiene USDT), devolvemos un valor por defecto seguro.
        // Este valor debe ser suficiente para una transferencia estándar.
        return 0.002;
    }
}


// --- ESTIMADOR PARA LA RED TRON ---

/**
 * Estima el costo en TRX para barrer (transferir) el saldo completo de USDT de una dirección.
 * La estimación en TRON se basa en la 'Energy' consumida.
 * @param {string} fromAddress - La dirección de la wallet de depósito que se va a barrer.
 * @param {number} usdtAmountToSweep - La cantidad de USDT a barrer.
 * @returns {Promise<number>} El costo estimado de la transacción en TRX.
 */
async function estimateTronSweepCost(fromAddress, usdtAmountToSweep) {
    try {
        const tronWeb = new TronWeb({
            fullHost: 'https://api.trongrid.io',
            headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY }
        });

        const usdtContract = await tronWeb.contract().at(USDT_TRON_ADDRESS);
        const decimals = await usdtContract.decimals().call();
        const amountInSmallestUnit = new tronWeb.BigNumber(usdtAmountToSweep).multipliedBy(Math.pow(10, decimals));
        
        // --- Simulación de la Transacción ---
        // 'triggerConstantContractQuery' es el método de simulación de TRON.
        const transactionObject = await tronWeb.transactionBuilder.triggerConstantContractQuery(
            USDT_TRON_ADDRESS,
            'transfer(address,uint256)',
            {}, // Opciones
            [
                { type: 'address', value: tronWeb.address.toHex(fromAddress) }, // Dirección temporal
                { type: 'uint256', value: amountInSmallestUnit.toString(10) }
            ],
            fromAddress // Dirección desde la que se simula
        );

        const energyUsed = transactionObject.energy_used;

        if (!energyUsed || energyUsed === 0) {
            // Si no se devuelve energía usada, probablemente la wallet no tiene USDT.
            // Devolvemos un costo por defecto. 30 TRX es un valor seguro para una transferencia TRC20.
            console.warn(`[GasEstimator-TRON] No se pudo estimar la energía para ${fromAddress}. Usando valor por defecto.`);
            return 30;
        }

        // Obtenemos los parámetros de la red para saber el costo de la energía.
        const chainParams = await tronWeb.trx.getChainParameters();
        const energyFeeParam = chainParams.find(p => p.key === 'getEnergyFee');
        const sunPerEnergyUnit = energyFeeParam ? energyFeeParam.value : 420; // 420 SUN es el valor estándar si la API no lo devuelve.

        // Calculamos el costo en SUN (la unidad más pequeña de TRX).
        const costInSun = energyUsed * sunPerEnergyUnit;
        
        // --- Búfer de Seguridad ---
        // Añadimos un 10% de búfer.
        const costInSunWithBuffer = Math.ceil(costInSun * 1.10);
        
        // Convertimos el resultado a TRX.
        const costInTrx = tronWeb.fromSun(costInSunWithBuffer);
        
        console.log(`[GasEstimator-TRON] Estimación para ${fromAddress}: Energy=${energyUsed} -> Costo: ${costInTrx.toFixed(4)} TRX`);
        
        return parseFloat(costInTrx);

    } catch (error) {
        console.error(`[GasEstimator-TRON] Error al estimar TRX para ${fromAddress}:`, error.message);
        // Devolvemos un valor por defecto seguro.
        return 30;
    }
}

module.exports = {
    estimateBscSweepCost,
    estimateTronSweepCost
};