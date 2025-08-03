// backend/utils/transactionLogger.js (v1.1 - SOPORTE PARA SESIONES)

const Transaction = require('../models/transactionModel');

/**
 * Crea y guarda un registro de transacción, con soporte opcional para sesiones de Mongoose.
 * @param {string} userId - El ID del usuario que realiza la transacción.
 * @param {string} type - El tipo de transacción (debe coincidir con el enum del modelo).
 * @param {number} amount - La cantidad de la transacción.
 * @param {string} currency - La moneda ('NTX' o 'USDT').
 * @param {string} description - Una descripción legible.
 * @param {object} [metadata={}] - Datos adicionales opcionales.
 * @param {import('mongoose').ClientSession} [session=null] - Una sesión de Mongoose para operaciones transaccionales.
 */
const createTransaction = async (userId, type, amount, currency, description, metadata = {}, session = null) => {
  try {
    const transaction = new Transaction({
      user: userId,
      type,
      amount,
      currency,
      description,
      metadata,
    });
    // [CORRECCIÓN] - Se pasa el objeto de opciones con la sesión si existe.
    await transaction.save({ session: session });
    console.log(`[Transacción] Registro creado: ${description}`);
  } catch (error) {
    console.error(`[Transacción] Fallo al registrar la transacción para el usuario ${userId}:`, error);
  }
};

module.exports = { createTransaction };