// RUTA: backend/controllers/toolController.js (VERSIÓN "NEXUS - PRECISION HOTFIX")
const Tool = require('../models/toolModel');
const User = require('../models/userModel');
const { createTransaction } = require('../utils/transactionLogger');
// La lógica de comisiones por compra fue eliminada según la nueva directiva de negocio.

const getTools = async (req, res) => {
  try {
    const tools = await Tool.find({ isFree: { $ne: true } }).sort({ vipLevel: 1 });
    res.json(tools);
  } catch (error) {
    console.error('Error al obtener herramientas:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

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
    if (tool.isFree) {
        return res.status(400).json({ message: 'La herramienta gratuita no se puede comprar.' });
    }
    if (!user) {
        return res.status(404).json({ message: 'Usuario no encontrado.' });
    }

    const totalCost = tool.price * quantity;

    // [NEXUS HOTFIX] - INICIO DE LA CORRECCIÓN CRÍTICA DE PRECISIÓN DE PUNTO FLOTANTE
    // Se comparan los valores como enteros (centavos) para evitar errores de redondeo.
    // Esto asegura que un usuario con un saldo de 3.00 puede comprar un artículo de 3.00.
    const userBalanceInCents = Math.round((user.balance.usdt || 0) * 100);
    const totalCostInCents = Math.round(totalCost * 100);

    if (userBalanceInCents < totalCostInCents) {
      console.warn(`[Purchase Fail] Usuario ${user._id} intento de compra fallido. Saldo: ${user.balance.usdt}, Costo: ${totalCost}`);
      return res.status(400).json({ message: 'Saldo USDT insuficiente.' });
    }
    // [NEXUS HOTFIX] - FIN DE LA CORRECCIÓN CRÍTICA
    
    const now = new Date();
    const expiryDate = new Date(now.getTime() + tool.durationDays * 24 * 60 * 60 * 1000);

    const newTools = Array(quantity).fill({
      tool: tool._id,
      purchaseDate: now,
      expiryDate: expiryDate,
    });
    
    const totalMiningBoost = tool.miningBoost * quantity;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $inc: {
          'balance.usdt': -totalCost,
          'effectiveMiningRate': totalMiningBoost
        },
        $push: { activeTools: { $each: newTools } },
        $set: { 
          lastMiningClaim: new Date(),
          miningStatus: 'IDLE'
        }
      },
      { new: true }
    ).populate('activeTools.tool');

    // Se crea el registro de la transacción de compra.
    createTransaction(userId, 'purchase', -totalCost, 'USDT', `Compra de ${quantity}x ${tool.name}`)
      .catch(err => {
          console.error(`Error al crear la transacción de compra para el usuario ${userId}:`, err);
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