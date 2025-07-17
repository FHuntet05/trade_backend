// backend/services/toolPurchaseService.js (NUEVO ARCHIVO)
const User = require('../models/userModel');
const Tool = require('../models/toolModel');
const { createTransaction } = require('../utils/transactionLogger');
const { distributeCommissions } = require('../services/commissionService');
const mongoose = require('mongoose');

/**
 * Encapsula la lógica de ejecutar una compra de herramienta.
 * Puede operar dentro de una transacción de Mongoose existente si se le pasa una sesión.
 * @param {string} userId - El ID del usuario que compra.
 * @param {string} toolId - El ID de la herramienta a comprar.
 * @param {number} quantity - La cantidad de herramientas a comprar.
 * @param {mongoose.Session} [session] - Una sesión opcional de Mongoose para operaciones atómicas.
 * @returns {object} El usuario actualizado.
 */
const fulfillPurchase = async (userId, toolId, quantity, session) => {
  if (!userId || !toolId || !quantity || quantity <= 0) {
    throw new Error('Datos de compra inválidos para fulfillPurchase.');
  }

  // Obtenemos la herramienta y el usuario. Si hay sesión, las consultas la usan.
  const tool = await Tool.findById(toolId).session(session || null);
  if (!tool) throw new Error('La herramienta no existe.');

  const user = await User.findById(userId).session(session || null);
  if (!user) throw new Error('Usuario no encontrado.');

  const totalCost = tool.price * quantity;
  if (user.balance.usdt < totalCost) {
    throw new Error('Saldo USDT insuficiente.');
  }

  // --- INICIO DE LÓGICA DE COMPRA ---
  const now = new Date();
  user.balance.usdt -= totalCost;

  const expiryDate = new Date(now.getTime() + tool.durationDays * 24 * 60 * 60 * 1000);
  for (let i = 0; i < quantity; i++) {
    user.activeTools.push({ tool: tool._id, purchaseDate: now, expiryDate: expiryDate });
  }

  // Guardamos el usuario, dentro de la sesión si existe
  await user.save({ session });

  // Creamos la transacción de compra, dentro de la sesión si existe
  await createTransaction(userId, 'purchase', totalCost, 'USDT', `Compra de ${quantity}x ${tool.name}`, session);

  // Distribuimos comisiones. Esta función también deberá ser consciente de la sesión si realiza operaciones de BD.
  await distributeCommissions(user, totalCost, session);

  return user;
};

module.exports = {
  fulfillPurchase,
};