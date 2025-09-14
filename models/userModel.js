// RUTA: backend/models/userModel.js (v50.0 - VERSIÓN "BLOCKSPHERE" FINAL)
// ARQUITECTURA: Esquema de transacciones anidadas, campos de seguridad del Modelo.

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// [BLOCKSPHERE - IMPLEMENTACIÓN #2]
// Se define un esquema para las transacciones. Este esquema se anidará
// dentro del modelo de usuario. Esto mejora la integridad referencial y el
// rendimiento de las consultas, eliminando la necesidad de una colección separada.
const transactionSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: [
            'deposit', 'withdrawal', 'purchase', 'mining_claim', 
            'referral_commission', 'task_reward', 'admin_credit', 'admin_debit'
        ]
    },
    amount: {
        type: Number,
        required: true
        // Nota: El monto será positivo para créditos y negativo para débitos.
    },
    currency: {
        type: String,
        required: true,
        enum: ['USDT', 'NTX'] // Se mantienen ambas por compatibilidad futura.
    },
    description: {
        type: String,
        required: true
    },
    status: {
        type: String,
        required: true,
        enum: ['pending', 'completed', 'rejected', 'failed'],
        default: 'completed'
    },
    // Metadata flexible para almacenar información adicional y específica de cada transacción.
    metadata: {
        type: Map,
        of: String
    }
}, {
    timestamps: true // Cada transacción tendrá su propio `createdAt` y `updatedAt`.
});


const userSchema = new mongoose.Schema({
    // --- Identificadores y Autenticación ---
    telegramId: {
        type: String,
        required: true,
        unique: true,
        index: true // Se añade índice para búsquedas rápidas.
    },
    username: {
        type: String,
        required: true,
        trim: true
    },
    fullName: {
        type: String,
        trim: true
    },
    password: {
        type: String,
        select: false // No se devuelve la contraseña en las consultas por defecto.
    },
    photoFileId: { // ID del archivo de la foto de perfil en Telegram
        type: String
    },

    // --- Roles y Permisos ---
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    status: {
        type: String,
        enum: ['active', 'banned', 'pending_verification'],
        default: 'active'
    },

    // --- Configuración de Seguridad y Estado ---
    isTwoFactorEnabled: {
        type: Boolean,
        default: false
    },
    twoFactorSecret: {
        type: String,
        select: false // No devolver el secreto 2FA por defecto.
    },
    mustResetPassword: { // Campo del Modelo para forzar cambio de contraseña a nuevos admins.
        type: Boolean,
        default: false
    },

    // --- Datos Financieros y de Negocio ---
    balance: {
        usdt: { type: Number, default: 0.0 },
        ntx: { type: Number, default: 0.0 } // Se conserva por si se usa en el futuro.
    },
    totalRecharge: {
        type: Number,
        default: 0
    },
    totalWithdrawal: {
        type: Number,
        default: 0
    },
    currentVipLevel: {
        type: Number,
        default: 0
    },

    // --- Estructura de Referidos ---
    referredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    referralCode: {
        type: String,
        unique: true,
        sparse: true // Permite valores nulos, pero si existe, debe ser único.
    },
    
    // [BLOCKSPHERE - IMPLEMENTACIÓN #2]
    // El array de transacciones anidadas, usando el esquema definido arriba.
    transactions: [transactionSchema]

}, {
    timestamps: true
});

// Middleware para hashear la contraseña antes de guardarla.
userSchema.pre('save', async function(next) {
    // Solo hashear si la contraseña ha sido modificada.
    if (!this.isModified('password')) {
        return next();
    }
    // Si no hay contraseña (ej. usuario creado vía Telegram sin login local), no hacer nada.
    if (!this.password) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Método para comparar la contraseña ingresada con la hasheada en la BD.
userSchema.methods.matchPassword = async function(enteredPassword) {
    if (!this.password) return false;
    return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User;