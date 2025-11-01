// RUTA: backend/services/profitDistributionService.js

const mongoose = require('mongoose');
const cron = require('node-cron');
const User = require('../models/userModel');
const Setting = require('../models/settingsModel');
const Transaction = require('../models/transactionModel');

/**
 * Itera sobre todos los usuarios activos, calcula sus ganancias pasivas diarias
 * basadas en su SALDO DISPONIBLE (balance.usdt) y los rangos de ganancia configurados,
 * y añade la ganancia calculada a su Saldo para Retiro.
 * 
 * LÓGICA CLAVE: Solo se otorga ganancia si el usuario ha mantenido el saldo
 * disponible durante al menos 24 horas.
 */
const distributeDailyProfits = async () => {
    console.log('[Cron Job] Iniciando la distribución de ganancias pasivas diarias...');
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const settings = await Setting.findOne({ singleton: 'global_settings' }).session(session);
        
        // Verificar si la funcionalidad está activada
        if (!settings || !settings.isPassiveProfitEnabled) {
            console.log('[Cron Job] Las ganancias pasivas están deshabilitadas. Proceso finalizado.');
            await session.commitTransaction();
            return;
        }

        if (!settings.profitTiers || settings.profitTiers.length === 0) {
            throw new Error('La configuración de rangos de ganancia (profitTiers) no se encontró o es inválida.');
        }

        const users = await User.find({ status: 'active' }).session(session);
        if (users.length === 0) {
            console.log('[Cron Job] No hay usuarios activos para distribuir ganancias. Proceso finalizado.');
            await session.commitTransaction();
            return;
        }

        let processedUsers = 0;
        for (const user of users) {
            // LÓGICA CRÍTICA: Usar el saldo disponible (balance.usdt), NO el saldo retirable
            const availableBalance = user.balance.usdt || 0;
            
            if (availableBalance <= 0) {
                continue; // Omitir usuarios sin saldo disponible
            }

            // Encontrar el rango de ganancia apropiado según el saldo disponible
            const profitPercentage = settings.calculateProfitPercentage(availableBalance);
            
            if (!profitPercentage || profitPercentage === 0) {
                console.warn(`[Profit Service] El usuario ${user.username} con saldo ${availableBalance} USDT no coincide con ningún rango de ganancia.`);
                continue;
            }

            // Calcular la ganancia basada en el porcentaje del rango
            const profitAmount = (availableBalance * profitPercentage) / 100;

            if (profitAmount > 0) {
                // LÓGICA DE NEGOCIO CRÍTICA: Añadir la ganancia al Saldo para Retiro
                user.withdrawableBalance = (user.withdrawableBalance || 0) + profitAmount;

                // Crear un registro de transacción para esta ganancia pasiva
                const transaction = new Transaction({
                    user: user._id,
                    type: 'passive_profit',
                    amount: profitAmount,
                    currency: 'USDT',
                    status: 'completed',
                    description: `Ganancia pasiva del ${profitPercentage.toFixed(2)}% sobre saldo disponible de ${availableBalance.toFixed(2)} USDT`,
                    metadata: {
                        baseBalance: availableBalance.toString(),
                        profitPercentage: profitPercentage.toString(),
                    }
                });

                await transaction.save({ session });
                await user.save({ session });
                processedUsers++;
            }
        }

        await session.commitTransaction();
        console.log(`[Cron Job] ✅ Distribución de ganancias pasivas finalizada. Usuarios procesados: ${processedUsers}.`);

    } catch (error) {
        await session.abortTransaction();
        console.error('[Cron Job] ❌ ERROR CRÍTICO durante la distribución de ganancias pasivas:', error);
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