// RUTA: backend/controllers/teamController.js (VERSIÓN "NEXUS - ATOMIC DECOUPLING")

const User = require('../models/userModel');
const mongoose = require('mongoose');

// La función 'getTeamStats' ha sido reconstruida para garantizar la integridad de los datos
// mediante el desacoplamiento de las consultas de comisiones y estadísticas del equipo.
const getTeamStats = async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user.id);

        // --- Consulta 1: Comisión del Usuario (Aislada y Atómica) ---
        // Esta consulta es simple y directa, garantizando que siempre sea correcta.
        const commissionPipeline = [
            { $match: { _id: userId } },
            { $unwind: "$transactions" },
            { $match: { "transactions.type": "referral_commission" } },
            {
                $group: {
                    _id: "$_id",
                    totalCommission: { $sum: "$transactions.amount" }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalCommission: 1
                }
            }
        ];
        
        // --- Consulta 2: Estadísticas del Equipo (Enfoque Dedicado) ---
        // Esta consulta ahora se enfoca únicamente en agregar los datos del equipo.
        const teamStatsPipeline = [
            { $match: { _id: userId } },
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
            { $unwind: { path: "$teamMembers", preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: "$_id",
                    totalTeamMembers: { $sum: { $cond: ["$teamMembers._id", 1, 0] } },
                    totalTeamRecharge: { $sum: { $ifNull: ["$teamMembers.totalRecharge", 0] } },
                    totalTeamWithdrawals: { $sum: { $ifNull: ["$teamMembers.totalWithdrawal", 0] } },
                    level1Members: { $sum: { $cond: [{ $eq: ['$teamMembers.level', 0] }, 1, 0] } },
                    level2Members: { $sum: { $cond: [{ $eq: ['$teamMembers.level', 1] }, 1, 0] } },
                    level3Members: { $sum: { $cond: [{ $eq: ['$teamMembers.level', 2] }, 1, 0] } },
                    level1Valid: { $sum: { $cond: [{ $and: [ { $eq: ['$teamMembers.level', 0] }, { $gt: ['$teamMembers.totalRecharge', 0] } ] }, 1, 0] } },
                    level2Valid: { $sum: { $cond: [{ $and: [ { $eq: ['$teamMembers.level', 1] }, { $gt: ['$teamMembers.totalRecharge', 0] } ] }, 1, 0] } },
                    level3Valid: { $sum: { $cond: [{ $and: [ { $eq: ['$teamMembers.level', 2] }, { $gt: ['$teamMembers.totalRecharge', 0] } ] }, 1, 0] } }
                }
            },
            {
                $project: {
                    _id: 0,
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

        // Ejecutar ambas consultas en paralelo para máxima eficiencia.
        const [commissionResult, teamStatsResult] = await Promise.all([
            User.aggregate(commissionPipeline),
            User.aggregate(teamStatsPipeline)
        ]);

        // Combinar los resultados en una única respuesta, manejando casos de borde.
        const totalCommission = commissionResult.length > 0 ? commissionResult[0].totalCommission : 0;
        
        const defaultTeamStats = {
            totalTeamMembers: 0, totalTeamRecharge: 0, totalTeamWithdrawals: 0,
            levels: [
                { level: 1, totalMembers: 0, validMembers: 0 },
                { level: 2, totalMembers: 0, validMembers: 0 },
                { level: 3, totalMembers: 0, validMembers: 0 },
            ],
        };

        const teamStats = teamStatsResult.length > 0 ? teamStatsResult[0] : defaultTeamStats;

        res.json({
            totalCommission,
            ...teamStats
        });

    } catch (error) {
        console.error("Error al obtener estadísticas del equipo:", error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};


// La función getLevelDetails no requiere cambios y se mantiene intacta.
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