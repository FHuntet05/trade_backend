// RUTA: backend/controllers/teamController.js (VERSIÓN "NEXUS - ATOMIC AGGREGATION FIX")

const User = require('../models/userModel');
const mongoose = require('mongoose');

// [NEXUS REPORTING V2] - La función 'getTeamStats' ha sido refactorizada para usar una única consulta atómica.
const getTeamStats = async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user.id);

        const aggregationPipeline = [
            // 1. Empezamos con el usuario actual.
            { $match: { _id: userId } },
            
            // 2. [NEXUS REPORTING V2] - Calculamos la comisión total del usuario ANTES de cualquier otra cosa.
            // Esto asegura que leemos las transacciones más recientes.
            {
                $project: {
                    totalCommission: {
                        $reduce: {
                            input: {
                                $filter: {
                                    input: "$transactions",
                                    as: "tx",
                                    cond: { $eq: ["$$tx.type", "referral_commission"] }
                                }
                            },
                            initialValue: 0,
                            in: { $add: ["$$value", "$$this.amount"] }
                        }
                    },
                    referrals: 1 // Pasamos el array de referidos a la siguiente etapa.
                }
            },
            
            // 3. Obtenemos todos los referidos hasta 3 niveles.
            {
                $graphLookup: {
                    from: 'users',
                    startWith: '$referrals.user',
                    connectFromField: 'referrals.user',
                    connectToField: '_id',
                    as: 'teamMembers',
                    maxDepth: 2,
                    depthField: 'level'
                }
            },
            
            // 4. Si el usuario no tiene equipo, 'teamMembers' estará vacío. Necesitamos manejar este caso.
            // Usamos $unwind de forma segura.
            { $unwind: { path: "$teamMembers", preserveNullAndEmptyArrays: true } },

            // 5. Agrupamos los resultados para sumar los totales y contar miembros por nivel.
            {
                $group: {
                    _id: "$_id",
                    totalCommission: { $first: "$totalCommission" }, // Mantenemos la comisión que ya calculamos.
                    totalTeamMembers: { $sum: { $cond: ["$teamMembers._id", 1, 0] } },
                    totalTeamRecharge: { $sum: "$teamMembers.totalRecharge" },
                    totalTeamWithdrawals: { $sum: "$teamMembers.totalWithdrawal" },
                    level1Members: { $sum: { $cond: [{ $eq: ['$teamMembers.level', 0] }, 1, 0] } },
                    level2Members: { $sum: { $cond: [{ $eq: ['$teamMembers.level', 1] }, 1, 0] } },
                    level3Members: { $sum: { $cond: [{ $eq: ['$teamMembers.level', 2] }, 1, 0] } },
                    level1Valid: { $sum: { $cond: [{ $and: [ { $eq: ['$teamMembers.level', 0] }, { $gt: ['$teamMembers.totalRecharge', 0] } ] }, 1, 0] } },
                    level2Valid: { $sum: { $cond: [{ $and: [ { $eq: ['$teamMembers.level', 1] }, { $gt: ['$teamMembers.totalRecharge', 0] } ] }, 1, 0] } },
                    level3Valid: { $sum: { $cond: [{ $and: [ { $eq: ['$teamMembers.level', 2] }, { $gt: ['$teamMembers.totalRecharge', 0] } ] }, 1, 0] } }
                }
            },

            // 6. Proyectamos el resultado final en el formato que espera el frontend.
            {
                $project: {
                    _id: 0,
                    totalCommission: 1,
                    totalTeamMembers: 1,
                    totalTeamRecharge: 1,
                    totalTeamWithdrawals: 1,
                    levels: [
                        { level: 1, totalMembers: '$level1Members', validMembers: '$level1Valid' },
                        { level: 2, totalMembers: '$level2Members', validMembers: '$level2Valid' },
                        { level: 3, totalMembers: '$level3Members', validMembers: '$level3Valid' },
                    ]
                }
            }
        ];
        
        const result = await User.aggregate(aggregationPipeline);
        
        // Si el usuario no tiene equipo, la agregación podría devolver un resultado vacío o parcial.
        // Nos aseguramos de devolver siempre una estructura de datos completa.
        const finalStats = result[0] || {
            totalCommission: 0,
            totalTeamMembers: 0,
            totalTeamRecharge: 0,
            totalTeamWithdrawals: 0,
            levels: [
                { level: 1, totalMembers: 0, validMembers: 0 },
                { level: 2, totalMembers: 0, validMembers: 0 },
                { level: 3, totalMembers: 0, validMembers: 0 },
            ],
        };

        // En el caso improbable de que un usuario no tenga equipo pero sí comisiones,
        // necesitamos obtener su totalCommission por separado si la agregación principal no lo devuelve.
        if (!result[0]) {
             const currentUser = await User.findById(userId).select('transactions').lean();
             finalStats.totalCommission = currentUser.transactions
                .filter(tx => tx.type === 'referral_commission')
                .reduce((sum, tx) => sum + tx.amount, 0);
        }

        res.json(finalStats);

    } catch (error) {
        console.error("Error al obtener estadísticas del equipo:", error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

// La función getLevelDetails no requiere cambios.
const getLevelDetails = async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user.id);
        const requestedLevel = parseInt(req.params.level, 10);

        if (![1, 2, 3].includes(requestedLevel)) {
            return res.status(400).json({ message: 'Nivel no válido.' });
        }

        const user = await User.findById(userId).populate({
            path: 'referrals.user',
            select: 'username photoFileId referrals',
            populate: {
                path: 'referrals.user',
                select: 'username photoFileId referrals',
                populate: {
                    path: 'referrals.user',
                    select: 'username photoFileId'
                }
            }
        });

        if (!user) { return res.json([]); }

        let levelMembers = [];
        if (requestedLevel === 1) { levelMembers = user.referrals.map(r => r.user); } 
        else if (requestedLevel === 2) { user.referrals.forEach(r1 => { if (r1.user && r1.user.referrals) { levelMembers.push(...r1.user.referrals.map(r2 => r2.user)); } }); } 
        else if (requestedLevel === 3) { user.referrals.forEach(r1 => { if (r1.user && r1.user.referrals) { r1.user.referrals.forEach(r2 => { if (r2.user && r2.user.referrals) { levelMembers.push(...r2.user.referrals.map(r3 => r3.user)); } }); } }); }
        
        const finalResponse = levelMembers.filter(Boolean).map(member => ({ username: member.username, photoFileId: member.photoFileId, }));

        res.json(finalResponse);

    } catch (error) {
        console.error(`Error al obtener detalles del nivel ${req.params.level}:`, error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

module.exports = { getTeamStats, getLevelDetails };