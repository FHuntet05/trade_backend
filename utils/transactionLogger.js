// backend/utils/transactionLogger.js

const Transaction = require('../models/transactionModel');

/**
 * Crea y guarda un registro de transacción.
 * @param {string} userId - El ID del usuario que realiza la transacción.
 * @param {string} type - El tipo de transacción (debe coincidir con el enum del modelo).
 * @param {number} amount - La cantidad de la transacción.
 * @param {string} currency - La moneda ('NTX' o 'USDT').
 * @param {string} description - Una descripción legible.
 * @param {object} metadata - Datos adicionales opcionales.
 */
const createTransaction = async (userId, type, amount, currency, description, metadata = {}) => {
  try {
    const transaction = new Transaction({
      user: userId,
      type,
      amount,
      currency,
      description,
      metadata,
    });
    await transaction.save();
    console.log(`[Transacción] Registro creado: ${description}`);
  } catch (error) {
    // Es importante que un fallo al registrar la transacción no detenga el flujo principal.
    // Solo lo registramos en la consola del servidor.
    console.error(`[Transacción] Fallo al registrar la transacción para el usuario ${userId}:`, error);
  }
};

module.exports = { createTransaction };