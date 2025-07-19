// backend/controllers/toolController.js (RECONSTRUCCIÓN FÉNIX v24.0)
const Tool = require('../models/toolModel');
const User = require('../models/userModel');
const { createTransaction } = require('../utils/transactionLogger');
const { distributeFixedCommissions } = require('../services/commissionService');

const getTools = async (req, res) => {
  try {
    const tools = await Tool.find().sort({ vipLevel: 1 });
    res.json(tools);
  } catch (error) {
    console.error('Error al obtener herramientas:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

/**
 * @desc Comprar una herramienta usando el saldo USDT interno.
 * @route POST /api/tools/purchase-with-balance
 *
 * JUSTIFICACIÓN DEL FRACASO v23: No actualizaba la potencia de minería del usuario,
 * haciendo que la compra fuera funcionalmente inútil.
 *
 * SOLUCIÓN FÉNIX v24.0:
 * 1. AÑADE ACTUALIZACIÓN DE POTENCIA: Se incluye un operador `$inc` para el campo
 *    `effectiveMiningRate` dentro de la misma operación atómica de la compra.
 * 2. CÁLCULO TOTAL: Se calcula el 'miningBoost' total basado en la cantidad ('quantity')
 *    de herramientas compradas.
 * 3. ATOMICIDAD TOTAL: El pago, la adición de la herramienta y el aumento de potencia
 *    ahora ocurren en una sola operación indestructible.
 */
const purchaseWithBalance = async (req, res) => {
  const { toolId, quantity } = req.body;
  const userId = req.user.id;

  if (!toolId || !quantity || quantity <= 0) {
    return res.status(400).json({ message: 'Datos de compra inválidos.' });
  }

  try {
    const [tool, user] = await Promise.all([
      Tool.findById(toolId).lean(),
      User.findById(userId).select('balance activeTools')
    ]);

    if (!tool) {
      return res.status(404).json({ message: 'Herramienta no encontrada.' });
    }
    if (!user) {
        return res.status(404).json({ message: 'Usuario no encontrado.' });
    }

    const totalCost = tool.price * quantity;

    if (user.balance.usdt < totalCost) {
      return res.status(400).json({ message: 'Saldo USDT insuficiente.' });
    }
    
    const isFirstPurchase = user.activeTools.length === 0;

    const now = new Date();
    const expiryDate = new Date(now.getTime() + tool.durationDays * 24 * 60 * 60 * 1000);

    const newTools = Array(quantity).fill({
      tool: tool._id,
      purchaseDate: now,
      expiryDate: expiryDate,
    });
    
    // **NUEVO**: Calcular el aumento total de potencia
    const totalMiningBoost = tool.miningBoost * quantity;

    // Ejecutar la actualización ATÓMICA Y COMPLETA del usuario
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $inc: {
          'balance.usdt': -totalCost, // Descuenta el saldo
          'effectiveMiningRate': totalMiningBoost // <-- ¡LA REPARACIÓN CRÍTICA!
        },
        $push: { activeTools: { $each: newTools } }, // Añade las herramientas
        $set: { 
          lastMiningClaim: new Date(), // Resetea el ciclo
          miningStatus: 'IDLE'
        }
      },
      { new: true }
    ).populate('activeTools.tool');

    // Operaciones de fondo (logging y comisiones)
    Promise.all([
        createTransaction(userId, 'purchase', totalCost, 'USDT', `Compra de ${quantity}x ${tool.name}`),
        isFirstPurchase ? distributeFixedCommissions(userId) : Promise.resolve()
    ]).catch(err => {
        console.error(`Error en operaciones post-compra para el usuario ${userId}:`, err);
    });

    res.json({
      message: `¡Has comprado ${quantity}x ${tool.name} con éxito! Tu potencia ha aumentado en ${totalMiningBoost.toFixed(2)} NTX/Día.`,
      user: updatedUser.toObject(),
    });

  } catch (error) {
    console.error('Error en la compra con saldo:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

module.exports = {
  getTools,
  purchaseWithBalance,
};