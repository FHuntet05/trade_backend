// RUTA: backend/services/commissionService.js (VERSIÓN "NEXUS - TYPE SYNC")

const User = require('../models/userModel');
const Setting = require('../models/settingsModel');
const { createTransaction } = require('../utils/transactionLogger');
const mongoose = require('mongoose');

const distributeDepositCommissions = async (depositorId, depositAmount) => {
  try {
    const [settings, depositor] = await Promise.all([
        Setting.findOne({ singleton: 'global_settings' }).lean(),
        User.findById(depositorId)
            .select('username referredBy')
            .populate({
                path: 'referredBy',
                select: 'username referredBy',
                populate: {
                    path: 'referredBy',
                    select: 'username referredBy',
                    populate: {
                        path: 'referredBy',
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
      return;
    }
    
    const DEPOSIT_COMMISSION_RATES = {
      1: settings.depositCommissionLevel1 || 0,
      2: settings.depositCommissionLevel2 || 0,
      3: settings.depositCommissionLevel3 || 0,
    };

    const referrers = [];
    if (depositor.referredBy) { referrers.push({ user: depositor.referredBy, level: 1 }); }
    if (referrers[0]?.user.referredBy) { referrers.push({ user: referrers[0].user.referredBy, level: 2 }); }
    if (referrers[1]?.user.referredBy) { referrers.push({ user: referrers[1].user.referredBy, level: 3 }); }
    
    const updatePromises = referrers.map(ref => {
      const commissionRate = DEPOSIT_COMMISSION_RATES[ref.level];
      if (!commissionRate || commissionRate <= 0) {
        return null;
      }

      const commissionAmount = depositAmount * (commissionRate / 100);
      const updateUserPromise = User.findByIdAndUpdate(ref.user._id, {
        $inc: { 'balance.usdt': commissionAmount }
      });
      
      // [NEXUS TYPE SYNC] - CORRECCIÓN CRÍTICA
      // Se cambia 'referral_commission' a 'commission' para coincidir con el transactionModel.
      const createTransactionPromise = createTransaction(
        ref.user._id,
        'commission', // <-- TIPO CORREGIDO
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

module.exports = {
  distributeDepositCommissions,
};