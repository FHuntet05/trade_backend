// RUTA: backend/models/priceModel.js
// --- VERSIÓN FINAL Y CORREGIDA ---

const mongoose = require('mongoose');

const priceSchema = new mongoose.Schema({
    // --- CAMPO AÑADIDO Y CORREGIDO ---
    // Este es el campo que faltaba. Se usa como una clave única para encontrar
    // siempre el mismo documento y actualizarlo (upsert).
    identifier: {
        type: String,
        required: true,
        unique: true,
        index: true, // Mejora el rendimiento de la búsqueda
    },
    prices: {
        type: Map,
        of: Number,
        required: true,
    },
    fullMarketData: {
        type: Map,
        of: mongoose.Schema.Types.Mixed, // Permite objetos anidados de cualquier tipo
        required: true,
    },
    lastUpdated: {
        type: Date,
        required: true,
    }
}, {
    timestamps: true // Opcional, pero buena práctica
});

const Price = mongoose.model('Price', priceSchema);

module.exports = Price;