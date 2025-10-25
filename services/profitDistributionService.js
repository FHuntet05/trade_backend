// RUTA: backend/services/profitDistributionService.js

const mongoose = require('mongoose');
const cron = require('node-cron');
const User = require('../models/userModel');
const Setting = require('../models/settingsModel');
const Transaction = require('../models/transactionModel');

/**
 * Itera sobre todos los usuarios activos, calcula sus ganancias pasivas diarias
 * basadas en su Saldo Total y los niveles de ganancia configurados,
 * y añade la ganancia calculada a su Saldo para Retiro.
 */
const distributeDailyProfits = async () => {
    console.log('[Cron Job] Iniciando la distribución de ganancias diarias...');
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const settings = await Setting.findOne({ singleton: 'global_settings' }).session(session);
        if (!settings || !settings.profitTiers || settings.profitTiers.length === 0) {
            throw new Error('La configuración de distribución de ganancias no se encontró o es inválida.');
        }

        const users = await User.find({ status: 'active' }).session(session);
        if (users.length === 0) {
            console.log('[Cron Job] No hay usuarios activos para distribuir ganancias. Proceso finalizado.');
            await session.commitTransaction(); // Commit vacío para cerrar la transacción.
            return;
        }

        let processedUsers = 0;
        for (const user of users) {
            const totalBalance = user.balance.usdt || 0;
            if (totalBalance <= 0) {
                continue; // Omitir usuarios sin saldo
            }

            // Usar el método del schema para encontrar el porcentaje de ganancia
            const profitPercentage = settings.calculateProfitPercentage(totalBalance);
            
            if (!profitPercentage || profitPercentage === 0) {
                console.warn(`[Profit Service] El usuario ${user.username} con saldo ${totalBalance} no coincide con ningún nivel de ganancia.`);
                continue;
            }

            const profitAmount = (totalBalance * profitPercentage) / 100;

            if (profitAmount > 0) {
                // LÓGICA DE NEGOCIO CRÍTICA: Añadir la ganancia al Saldo para Retiro.
                user.withdrawableBalance = (user.withdrawableBalance || 0) + profitAmount;

                // Crear un registro de transacción para esta ganancia
                const transaction = new Transaction({
                    user: user._id,
                    type: 'investment_profit',
                    amount: profitAmount,
                    currency: 'USDT',
                    status: 'completed',
                    description: `Ganancia pasiva diaria (${profitPercentage.toFixed(2)}% sobre Saldo Total de ${totalBalance.toFixed(2)} USDT)`,
                    metadata: {
                        baseBalance: totalBalance.toString(),
                        profitPercentage: profitPercentage.toString(),
                    }
                });

                await transaction.save({ session });
                await user.save({ session });
                processedUsers++;
            }
        }

        await session.commitTransaction();
        console.log(`[Cron Job] La distribución de ganancias diarias finalizó exitosamente. Usuarios procesados: ${processedUsers}.`);

    } catch (error) {
        await session.abortTransaction();
        console.error('[Cron Job] ERROR CRÍTICO durante la distribución de ganancias diarias:', error);
    } finally {
        session.endSession();
    }
};

/**
 * Configura el cron job para que ejecute la distribución de ganancias
 * una vez cada 24 horas.
 */
const scheduleProfitDistribution = () => {
    // Se programa para ejecutarse todos los días a las 00:05 UTC para evitar la congestión de la medianoche.
    cron.schedule('5 0 * * *', distributeDailyProfits, {
        scheduled: true,
        timezone: "UTC"
    });
    console.log('✅ [Profit Service] El trabajo de distribución de ganancias diarias ha sido programado.');
};

module.exports = {
    scheduleProfitDistribution,
    distributeDailyProfits // Se exporta para poder llamarlo manualmente si es necesario (ej. para pruebas)
};