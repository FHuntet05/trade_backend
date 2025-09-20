// RUTA: backend/models/toolModel.js (VERSIÓN "NEXUS - FREE TOOL ENABLED")
const mongoose = require('mongoose');

const toolSchema = new mongoose.Schema({
  name: { type: String, required: true },
  vipLevel: { type: Number, required: true, unique: true },
  price: { type: Number, required: true },
  miningBoost: { type: Number, required: true }, // Aumento de NTX/DÍA
  durationDays: { type: Number, required: true },
  imageUrl: { type: String, required: true },
  
  // [NEXUS ONBOARDING FIX]
  // Este campo es la base del nuevo flujo de bienvenida.
  // Permite al administrador designar una (y solo una) herramienta
  // como el paquete de inicio para todos los nuevos usuarios.
  isFree: { type: Boolean, default: false },
});

// Este índice garantiza que solo puede haber un documento en la colección
// donde el campo 'isFree' sea 'true'. Esto previene errores de configuración
// en los que múltiples herramientas gratuitas podrían ser asignadas.
toolSchema.index({ isFree: 1 }, { unique: true, partialFilterExpression: { isFree: true } });

module.exports = mongoose.model('Tool', toolSchema);