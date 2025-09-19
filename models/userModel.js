// RUTA: backend/models/userModel.js (VERSIÓN NEXUS - VALIDATION FIX APPLIED)
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const transactionSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        // ======================= INICIO DE LA CORRECCIÓN CRÍTICA =======================
        enum: [
            'deposit', 'withdrawal', 'purchase', 'mining_claim', 'referral_commission', 
            'task_reward', 'admin_credit', 'admin_debit', 'swap_ntx_to_usdt',
            'admin_action' // <-- AÑADIDO: Nuevo tipo para registros de auditoría
        ]
        // ======================== FIN DE LA CORRECCIÓN CRÍTICA =========================
    },
    amount: { type: Number, required: true },
    // ======================= INICIO DE LA CORRECCIÓN CRÍTICA =======================
    currency: { 
        type: String, 
        required: true, 
        enum: ['USDT', 'NTX', 'SYSTEM'] // <-- AÑADIDO: 'SYSTEM' para acciones internas
    },
    // ======================== FIN DE LA CORRECCIÓN CRÍTICA =========================
    description: { type: String, required: true },
    status: { type: String, required: true, enum: ['pending', 'completed', 'rejected', 'failed'], default: 'completed' },
    metadata: { type: Map, of: String }
}, { timestamps: true });


const userSchema = new mongoose.Schema({
    // --- Identificadores y Autenticación ---
    telegramId: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true, trim: true },
    fullName: { type: String, trim: true },
    password: { type: String, select: false },
    photoFileId: { type: String },

    // --- Roles y Permisos ---
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    status: { type: String, enum: ['active', 'banned', 'pending_verification'], default: 'active' },

    // --- Configuración de Seguridad y Estado ---
    isTwoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, select: false },
    mustResetPassword: { type: Boolean, default: false },

    // --- Datos Financieros y de Negocio ---
    balance: {
        usdt: { type: Number, default: 0.0 },
        ntx: { type: Number, default: 0.0 }
    },
    totalRecharge: { type: Number, default: 0 },
    totalWithdrawal: { type: Number, default: 0 },
    currentVipLevel: { type: Number, default: 0 },
    
    // --- Estado de Tareas y Progreso ---
    claimedTasks: {
        type: Map,
        of: Boolean,
        default: {}
    },
    
    telegramVisited: {
        type: Boolean,
        default: false
    },

    // --- Estructura de Referidos ---
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    referralCode: { type: String, unique: true, sparse: true },
    referrals: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        level: { type: Number, default: 1 }
    }],
    
    // --- Historial de Transacciones y Herramientas ---
    transactions: [transactionSchema],
    activeTools: [{
        tool: { type: mongoose.Schema.Types.ObjectId, ref: 'Tool' },
        purchaseDate: { type: Date, default: Date.now },
        expiryDate: { type: Date }
    }]

}, {
    timestamps: true
});

// --- Métodos y Hooks (sin cambios) ---
userSchema.pre('save', async function(next) {
    if (!this.isModified('password') || !this.password) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

userSchema.methods.matchPassword = async function(enteredPassword) {
    if (!this.password) return false;
    return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User;