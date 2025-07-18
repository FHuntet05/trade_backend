// backend/services/commissionService.js (RECONSTRUCCIÓN FÉNIX v23.1 - COMISIONES FIJAS)

const User = require('../models/userModel');
const { createTransaction } = require('../utils/transactionLogger');
const mongoose = require('mongoose');

/**
 * Distribuye comisiones fijas de referido de forma atómica y eficiente.
 *
 * JUSTIFICACIÓN: La versión anterior asumía porcentajes. Esta versión implementa la
 * regla de negocio correcta: comisiones FIJAS en USDT por nivel. La arquitectura
 * atómica y eficiente se mantiene.
 *
 * @param {mongoose.Types.ObjectId} buyerId - El ID del usuario que realizó su primera compra.
 */
const distributeFixedCommissions = async (buyerId) => {
  try {
    // 1. Definir las comisiones FIJAS por nivel. ESTA ES LA REGLA DE NEGOCIO CORRECTA.
    const FIXED_COMMISSIONS = {
      1: 0.25, // 0.25 USDT para el Nivel 1
      2: 0.15, // 0.15 USDT para el Nivel 2
      3: 0.05, // 0.05 USDT para el Nivel 3
    };

    // 2. Obtener la cadena de referidos en UNA SOLA consulta eficiente.
    const buyer = await User.findById(buyerId)
      .select('username referredBy')
      .populate({
        path: 'referredBy',
        select: 'username referredBy', // No necesitamos el balance aquí, optimización menor
        populate: {
          path: 'referredBy',
          select: 'username referredBy',
          populate: {
            path: 'referredBy',
            select: 'username',
          },
        },
      })
      .lean();

    if (!buyer || !buyer.referredBy) {
      // No hay referente, no hay nada que hacer.
      return;
    }
    
    const referrers = [];
    if (buyer.referredBy) { referrers.push({ user: buyer.referredBy, level: 1 }); }
    if (referrers[0]?.user.referredBy) { referrers.push({ user: referrers[0].user.referredBy, level: 2 }); }
    if (referrers[1]?.user.referredBy) { referrers.push({ user: referrers[1].user.referredBy, level: 3 }); }
    
    // 3. Preparar todas las operaciones de actualización y transacciones.
    const updatePromises = referrers.map(ref => {
      const commissionAmount = FIXED_COMMISSIONS[ref.level];
      if (!commissionAmount) return null; // Seguridad por si algo sale mal

      // La operación ATÓMICA Y SEGURA para actualizar el saldo
      const updateUserPromise = User.findByIdAndUpdate(ref.user._id, {
        $inc: { 'balance.usdt': commissionAmount }
      });
      
      const createTransactionPromise = createTransaction(
        ref.user._id,
        'commission',
        commissionAmount,
        'USDT',
        `Comisión Nivel ${ref.level} por compra de ${buyer.username}`
      );

      return Promise.all([updateUserPromise, createTransactionPromise]);
    }).filter(Boolean); // Filtra cualquier nulo

    // 4. Ejecutar todas las actualizaciones en paralelo.
    await Promise.all(updatePromises);
    console.log(`[CommissionService] Comisiones FIJAS distribuidas por la compra de ${buyer.username}.`);

  } catch (error) {
    console.error(`[CommissionService] Fallo catastrófico al distribuir comisiones para la compra del usuario ${buyerId}:`, error);
  }
};

module.exports = {
  distributeFixedCommissions,
};