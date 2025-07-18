// backend/controllers/toolController.js (RECONSTRUCCIÓN FÉNIX v23.0)
const Tool = require('../models/toolModel');
const User = require('../models/userModel');
const { createTransaction } = require('../utils/transactionLogger'); // Importamos para loguear la compra
const { distributeFixedCommissions } = require('../services/commissionService'); // Importamos el motor de comisiones

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
 * JUSTIFICACIÓN DEL FRACASO ANTERIOR:
 * 1. NO VERIFICABA PRIMERA COMPRA: Pagaba comisiones siempre.
 * 2. NO LLAMABA AL SERVICIO DE COMISIONES: El motor estaba desconectado.
 * 3. USABA user.save(): No era atómico y podía causar inconsistencias.
 *
 * SOLUCIÓN FÉNIX v23.0:
 * 1. VERIFICA PRIMERA COMPRA: Se consulta si 'activeTools' está vacío antes de la compra.
 * 2. LLAMA AL SERVICIO: Si es la primera compra, invoca 'distributeFixedCommissions'.
 * 3. USA OPERADORES ATÓMICOS: Utiliza findByIdAndUpdate con $inc y $push para garantizar la integridad.
 */
const purchaseWithBalance = async (req, res) => {
  const { toolId, quantity } = req.body;
  const userId = req.user.id;

  if (!toolId || !quantity || quantity <= 0) {
    return res.status(400).json({ message: 'Datos de compra inválidos.' });
  }

  try {
    // 1. Obtener datos necesarios en paralelo para eficiencia
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
    
    // 2. VERIFICACIÓN CRÍTICA DE PRIMERA COMPRA
    const isFirstPurchase = user.activeTools.length === 0;

    // 3. Preparar la actualización atómica del usuario
    const now = new Date();
    const expiryDate = new Date(now.getTime() + tool.durationDays * 24 * 60 * 60 * 1000);

    const newTools = Array(quantity).fill({
      tool: tool._id,
      purchaseDate: now,
      expiryDate: expiryDate,
    });
    
    // 4. Ejecutar la actualización ATÓMICA del usuario
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $inc: { 'balance.usdt': -totalCost }, // Descuenta el saldo de forma segura
        $push: { activeTools: { $each: newTools } }, // Añade las nuevas herramientas
        $set: { 
          lastMiningClaim: new Date(), // Resetea el ciclo de minería
          miningStatus: 'IDLE'
        }
      },
      { new: true } // Devuelve el documento actualizado
    ).populate('activeTools.tool');

    // 5. Registrar la transacción de compra y, SI APLICA, disparar comisiones
    // Se ejecutan en paralelo para no bloquear la respuesta al usuario.
    Promise.all([
        createTransaction(userId, 'purchase', totalCost, 'USDT', `Compra de ${quantity}x ${tool.name}`),
        isFirstPurchase ? distributeFixedCommissions(userId) : Promise.resolve()
    ]).catch(err => {
        // Logueamos cualquier error en las operaciones de fondo, pero no afectamos al usuario que ya pagó.
        console.error(`Error en operaciones post-compra para el usuario ${userId}:`, err);
    });

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
  purchaseWithBalance,
};