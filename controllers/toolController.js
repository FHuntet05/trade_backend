// backend/controllers/toolController.js (VERSIÓN "NEXUS - STOREFRONT FIX")
const Tool = require('../models/toolModel');
const User = require('../models/userModel');
const { createTransaction } = require('../utils/transactionLogger');
const { distributeFixedCommissions } = require('../services/commissionService');

const getTools = async (req, res) => {
  try {
    // [NEXUS STOREFRONT FIX] - CORRECCIÓN CRÍTICA
    // Filtramos para que la herramienta gratuita NUNCA se envíe a la tienda.
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
    // [NEXUS STOREFRONT FIX] - Medida de seguridad adicional en el backend.
    // Prevenimos explícitamente la compra de una herramienta gratuita.
    if (tool.isFree) {
        return res.status(400).json({ message: 'La herramienta gratuita no se puede comprar.' });
    }
    if (!user) {
        return res.status(404).json({ message: 'Usuario no encontrado.' });
    }

    const totalCost = tool.price * quantity;

    if (user.balance.usdt < totalCost) {
      return res.status(400).json({ message: 'Saldo USDT insuficiente.' });
    }
    
    // Comprobamos si es la primera compra de una herramienta NO gratuita.
    const purchasedTools = await User.findById(userId).populate('activeTools.tool').then(u => {
        return u.activeTools.filter(t => t.tool && !t.tool.isFree).length > 0;
    });
    const isFirstPurchase = !purchasedTools;


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