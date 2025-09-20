// RUTA: backend/services/commissionService.js (VERSIÓN "NEXUS - REFINED & SIMPLIFIED")

const User = require('../models/userModel');
const Setting = require('../models/settingsModel');
const { createTransaction } = require('../utils/transactionLogger');
const mongoose = require('mongoose');

/**
 * Distribuye comisiones por el PRIMER DEPÓSITO de un usuario, basadas en porcentajes del sistema.
 * @param {mongoose.Types.ObjectId} depositorId - El ID del usuario que realizó el depósito.
 * @param {number} depositAmount - El monto en USDT del depósito que genera la comisión.
 */
const distributeDepositCommissions = async (depositorId, depositAmount) => {
  try {
    // 1. Obtener la configuración del sistema y la cadena de referidos del depositante.
    const [settings, depositor] = await Promise.all([
        Setting.findOne({ singleton: 'global_settings' }).lean(),
        User.findById(depositorId)
            .select('username referredBy')
            .populate({
                path: 'referredBy', // Nivel 1
                select: 'username referredBy',
                populate: {
                    path: 'referredBy', // Nivel 2
                    select: 'username referredBy',
                    populate: {
                        path: 'referredBy', // Nivel 3
                        select: 'username',
                    },
                },
            })
            .lean()
    ]);

    if (!settings) {
        console.error('[CommissionService] Error crítico: No se encontró la configuración del sistema para comisiones de depósito.');
        return;
    }
    
    if (!depositor || !depositor.referredBy) {
      // console.log(`[CommissionService] El depositante ${depositor.username} no tiene referente. No se distribuyen comisiones.`);
      return;
    }
    
    // 2. Crear un mapa de porcentajes de comisión desde los ajustes.
    const DEPOSIT_COMMISSION_RATES = {
      1: settings.depositCommissionLevel1 || 0,
      2: settings.depositCommissionLevel2 || 0,
      3: settings.depositCommissionLevel3 || 0,
    };

    // 3. Construir la cadena de referentes hasta 3 niveles.
    const referrers = [];
    if (depositor.referredBy) { referrers.push({ user: depositor.referredBy, level: 1 }); }
    if (referrers[0]?.user.referredBy) { referrers.push({ user: referrers[0].user.referredBy, level: 2 }); }
    if (referrers[1]?.user.referredBy) { referrers.push({ user: referrers[1].user.referredBy, level: 3 }); }
    
    // 4. Calcular y aplicar las comisiones para cada nivel.
    const updatePromises = referrers.map(ref => {
      const commissionRate = DEPOSIT_COMMISSION_RATES[ref.level];
      if (!commissionRate || commissionRate <= 0) {
        return null; // Si la comisión para este nivel es 0, no hacemos nada.
      }

      const commissionAmount = depositAmount * (commissionRate / 100);

      const updateUserPromise = User.findByIdAndUpdate(ref.user._id, {
        $inc: { 'balance.usdt': commissionAmount }
      });
      
      const createTransactionPromise = createTransaction(
        ref.user._id,
        'referral_commission',
        commissionAmount,
        'USDT',
        `Comisión Nivel ${ref.level} por primer depósito de ${depositor.username}`
      );

      return Promise.all([updateUserPromise, createTransactionPromise]);
    }).filter(Boolean);

    if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
        console.log(`[CommissionService] ✅ Comisiones por depósito distribuidas exitosamente por el depósito de ${depositor.username}.`.green);
    }

  } catch (error) {
    console.error(`[CommissionService] ❌ Fallo catastrófico al distribuir comisiones por depósito para el usuario ${depositorId}:`.red.bold, error);
  }
};

// [NEXUS REFINEMENT] - Las funciones 'distributeCommissions' y 'distributeFixedCommissions'
// han sido eliminadas por ser obsoletas según la nueva lógica de negocio.

module.exports = {
  distributeDepositCommissions, // Se exporta únicamente la función relevante.
};