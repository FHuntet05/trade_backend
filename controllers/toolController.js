// backend/controllers/toolController.js
const Tool = require('../models/toolModel');
const User = require('../models/userModel');

const getTools = async (req, res) => {
  try {
    // Ordenamos por vipLevel para que se muestren en orden en el frontend
    const tools = await Tool.find().sort({ vipLevel: 1 });
    res.json(tools);
  } catch (error) {
    console.error('Error al obtener herramientas:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};


// MODIFICADO: Ahora es para pagar con saldo interno
// @desc    Comprar una herramienta usando el saldo USDT interno
// @route   POST /api/tools/purchase-with-balance
const purchaseWithBalance = async (req, res) => {
  const { toolId, quantity } = req.body;
  const userId = req.user.id;

  if (!toolId || !quantity || quantity <= 0) {
    return res.status(400).json({ message: 'Datos de compra inválidos.' });
  }

  try {
    const tool = await Tool.findById(toolId);
    if (!tool) {
      return res.status(404).json({ message: 'Herramienta no encontrada.' });
    }

    const user = await User.findById(userId);
    const totalCost = tool.price * quantity;

    if (user.balance.usdt < totalCost) {
      return res.status(400).json({ message: 'Saldo USDT insuficiente.' });
    }
    
    user.balance.usdt -= totalCost;

    const now = new Date();
    const expiryDate = new Date();
    expiryDate.setDate(now.getDate() + tool.durationDays);

    for (let i = 0; i < quantity; i++) {
        user.activeTools.push({
            tool: tool._id,
            purchaseDate: now,
            expiryDate: expiryDate,
        });
    }
    
    await user.save();
    
    const updatedUser = await User.findById(userId).populate('activeTools.tool');

    res.json({
      message: `¡Has comprado ${quantity}x ${tool.name} con éxito!`,
      user: updatedUser.toObject(),
    });

  } catch (error) {
    console.error('Error en la compra con saldo:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

module.exports = {
  getTools,
  purchaseWithBalance, // Exportamos la función con el nuevo nombre
};