// RUTA: backend/services/commissionService.js (VERSIÓN "NEXUS - SETTINGS AWARE")

const User = require('../models/userModel');
const Setting = require('../models/settingsModel'); // <-- 1. Importar el modelo de configuración.
const { createTransaction } = require('../utils/transactionLogger');
const mongoose = require('mongoose');

/**
 * [REFACTORIZADO] Distribuye comisiones basadas en PORCENTAJES definidos en los ajustes del sistema.
 *
 * @param {mongoose.Types.ObjectId} buyerId - El ID del usuario que realizó una compra.
 * @param {number} purchaseAmount - El monto total en USDT de la compra que genera la comisión.
 */
const distributeCommissions = async (buyerId, purchaseAmount) => {
  try {
    // 2. Obtener la configuración del sistema y la cadena de referidos en paralelo.
    const [settings, buyer] = await Promise.all([
        Setting.findOne({ singleton: 'global_settings' }).lean(),
        User.findById(buyerId)
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
        console.error('[CommissionService] Error crítico: No se encontró la configuración del sistema.');
        return;
    }
    
    if (!buyer || !buyer.referredBy) {
      return; // No hay referente, no hay nada que hacer.
    }
    
    // 3. Crear un mapa de porcentajes de comisión desde los ajustes.
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

      // 4. Calcular el monto de la comisión basado en el porcentaje.
      const commissionAmount = purchaseAmount * (commissionRate / 100);

      const updateUserPromise = User.findByIdAndUpdate(ref.user._id, {
        $inc: { 'balance.usdt': commissionAmount }
      });
      
      const createTransactionPromise = createTransaction(
        ref.user._id,
        'referral_commission', // Tipo de transacción más específico
        commissionAmount,
        'USDT',
        `Comisión Nivel ${ref.level} por compra de ${buyer.username}`
      );

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

// Se mantiene la función anterior por si se necesita en otra parte, pero se renombra para evitar conflictos.
const distributeFixedCommissions = async (buyerId) => { /* ...código anterior... */ };


module.exports = {
  distributeCommissions, // Exportamos la nueva función basada en porcentajes.
  distributeFixedCommissions,
};