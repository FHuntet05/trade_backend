// backend/models/pendingReferralModel.js
const mongoose = require('mongoose');

const pendingReferralSchema = new mongoose.Schema({
  // El ID de Telegram del nuevo usuario que ha sido referido
  newUserId: { 
    type: String,
    required: true,
    unique: true, // Solo puede haber una entrada por nuevo usuario
  },
  // El ID de Telegram del usuario que lo ha referido
  referrerId: { 
    type: String,
    required: true,
  },
  // Este campo hará que el documento se borre solo después de 24 horas
  // para mantener la base de datos limpia.
  createdAt: {
    type: Date,
    default: Date.now,
    expires: '24h', 
  },
});

const PendingReferral = mongoose.model('PendingReferral', pendingReferralSchema);

module.exports = PendingReferral;