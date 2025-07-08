// backend/services/commissionService.js

const User = require('../models/userModel');
const { createTransaction } = require('../utils/transactionLogger');

const distributeCommissions = async (buyerId) => {
  try {
    const commissionRates = { 1: 0.25, 2: 0.15, 3: 0.05 };
    let currentUser = await User.findById(buyerId).populate('referredBy');
    
    for (let level = 1; level <= 3; level++) {
      if (!currentUser?.referredBy) break;

      const referrer = currentUser.referredBy;
      // Asumimos que la comisión es un % del precio de una herramienta base.
      // O si la comisión es fija, este valor debe ser ajustado.
      // POR FAVOR, REVISA ESTA LÍNEA. ¿De dónde viene el monto de la comisión?
      // Por ahora, asumiré una comisión fija como estaba en tu código original.
      const commissionAmount = commissionRates[level]; 
      
      referrer.balance.usdt += commissionAmount;
      await referrer.save();

      await createTransaction(
        referrer._id, 
        'referral_commission', 
        commissionAmount, 
        'USDT', 
        `Comisión Nivel ${level} por referido ${currentUser.username}`
      );
      
      currentUser = await User.findById(referrer._id).populate('referredBy');
    }
  } catch (error) {
    console.error(`Error en distributeCommissions para ${buyerId}:`, error);
    // Es importante que este error no detenga el flujo principal de la compra.
  }
};

module.exports = {
  distributeCommissions,
};