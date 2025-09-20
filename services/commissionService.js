// RUTA: backend/services/commissionService.js (VERSIÓN "NEXUS - FULLY RESTORED & ENHANCED")

const User = require('../models/userModel');
const Setting = require('../models/settingsModel');
const { createTransaction } = require('../utils/transactionLogger');
const mongoose = require('mongoose');

/**
 * [NUEVA] Distribuye comisiones por el PRIMER DEPÓSITO de un usuario, basadas en porcentajes del sistema.
 * @param {mongoose.Types.ObjectId} depositorId - El ID del usuario que realizó el depósito.
 * @param {number} depositAmount - El monto en USDT del depósito que genera la comisión.
 */
const distributeDepositCommissions = async (depositorId, depositAmount) => {
  try {
    const [settings, depositor] = await Promise.all([
        Setting.findOne({ singleton: 'global_settings' }).lean(),
        User.findById(depositorId)
            .select('username referredBy')
            .populate({ path: 'referredBy', select: 'username referredBy', populate: { path: 'referredBy', select: 'username referredBy', populate: { path: 'referredBy', select: 'username' } } })
            .lean()
    ]);

    if (!settings) {
        console.error('[CommissionService] Error crítico: No se encontró la configuración del sistema para comisiones de depósito.');
        return;
    }
    
    if (!depositor || !depositor.referredBy) {
      console.log(`[CommissionService] El depositante ${depositor.username} no tiene referente. No se distribuyen comisiones.`);
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
      if (!commissionRate || commissionRate <= 0) return null;

      const commissionAmount = depositAmount * (commissionRate / 100);

      const updateUserPromise = User.findByIdAndUpdate(ref.user._id, { $inc: { 'balance.usdt': commissionAmount } });
      const createTransactionPromise = createTransaction(ref.user._id, 'referral_commission', commissionAmount, 'USDT', `Comisión Nivel ${ref.level} por primer depósito de ${depositor.username}`);
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


/**
 * [EXISTENTE] Distribuye comisiones basadas en PORCENTAJES por COMPRA DE HERRAMIENTAS.
 */
const distributeCommissions = async (buyerId, purchaseAmount) => {
  try {
    const [settings, buyer] = await Promise.all([
        Setting.findOne({ singleton: 'global_settings' }).lean(),
        User.findById(buyerId)
            .select('username referredBy')
            .populate({ path: 'referredBy', select: 'username referredBy', populate: { path: 'referredBy', select: 'username referredBy', populate: { path: 'referredBy', select: 'username' } } })
            .lean()
    ]);

    if (!settings) {
        console.error('[CommissionService] Error crítico: No se encontró la configuración del sistema.');
        return;
    }
    
    if (!buyer || !buyer.referredBy) return;
    
    const COMMISSION_RATES = {
      1: settings.commissionLevel1 || 0,
      2: settings.commissionLevel2 || 0,
      3: settings.commissionLevel3 || 0,
    };

    const referrers = [];
    if (buyer.referredBy) { referrers.push({ user: buyer.referredBy, level: 1 }); }
    if (referrers[0]?.user.referredBy) { referrers.push({ user: referrers[0].user.referredBy, level: 2 }); }
    if (referrers[1]?.user.referredBy) { referrers.push({ user: referrers[1].user.referredBy, level: 3 }); }
    
    const updatePromises = referrers.map(ref => {
      const commissionRate = COMMISSION_RATES[ref.level];
      if (!commissionRate || commissionRate <= 0) return null;

      const commissionAmount = purchaseAmount * (commissionRate / 100);

      const updateUserPromise = User.findByIdAndUpdate(ref.user._id, { $inc: { 'balance.usdt': commissionAmount } });
      const createTransactionPromise = createTransaction(ref.user._id, 'referral_commission', commissionAmount, 'USDT', `Comisión Nivel ${ref.level} por compra de ${buyer.username}`);
      return Promise.all([updateUserPromise, createTransactionPromise]);
    }).filter(Boolean);

    if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
        console.log(`[CommissionService] Comisiones por porcentaje distribuidas por la compra de ${buyer.username}.`);
    }
  } catch (error) {
    console.error(`[CommissionService] Fallo catastrófico al distribuir comisiones para la compra del usuario ${buyerId}:`, error);
  }
};


/**
 * [RESTAURADA] Distribuye una comisión FIJA al referente directo (Nivel 1) por la PRIMERA compra de su referido.
 * @param {mongoose.Types.ObjectId} buyerId - El ID del usuario que realizó su primera compra.
 */
const distributeFixedCommissions = async (buyerId) => {
  try {
    const [settings, buyer] = await Promise.all([
        Setting.findOne({ singleton: 'global_settings' }).lean(),
        User.findById(buyerId).select('username referredBy').populate('referredBy', 'username').lean()
    ]);

    if (!settings) {
        console.error('[CommissionService] (Fixed) Error: No se encontró la configuración del sistema.');
        return;
    }

    const fixedCommissionAmount = settings.fixedCommissionAmount || 0;
    if (fixedCommissionAmount <= 0) {
        // No hay comisión fija configurada, no hacemos nada.
        return;
    }

    if (!buyer || !buyer.referredBy) {
        return; // No hay referente, no hay nada que hacer.
    }
    
    const referrer = buyer.referredBy;

    await User.findByIdAndUpdate(referrer._id, {
        $inc: { 'balance.usdt': fixedCommissionAmount }
    });

    await createTransaction(
        referrer._id,
        'referral_commission',
        fixedCommissionAmount,
        'USDT',
        `Comisión Fija por primera compra de ${buyer.username}`
    );
    
    console.log(`[CommissionService] (Fixed) Comisión fija de ${fixedCommissionAmount} USDT pagada a ${referrer.username}.`);

  } catch (error) {
    console.error(`[CommissionService] (Fixed) Fallo al distribuir comisión fija para la compra del usuario ${buyerId}:`, error);
  }
};


module.exports = {
  distributeDepositCommissions,
  distributeCommissions,
  distributeFixedCommissions,
};