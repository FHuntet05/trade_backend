// RUTA: backend/controllers/teamController.js (VERSIÓN "NEXUS - REPORTING AGGREGATION")

const User = require('../models/userModel');
const mongoose = require('mongoose');

// [NEXUS REPORTING FIX] - La función 'getTeamStats' ha sido completamente refactorizada
// para usar una única y eficiente consulta de agregación de MongoDB.
const getTeamStats = async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user.id);

        // Obtenemos al usuario solicitante para calcular su comisión total por separado.
        const currentUser = await User.findById(userId).select('transactions').lean();
        if (!currentUser) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        const totalCommission = currentUser.transactions
            .filter(tx => tx.type === 'referral_commission')
            .reduce((sum, tx) => sum + tx.amount, 0);

        // La pipeline de agregación para calcular las estadísticas del equipo.
        const teamStatsPipeline = [
            // 1. Empezamos con el usuario actual.
            { $match: { _id: userId } },
            // 2. Usamos $graphLookup para obtener todos los referidos hasta 3 niveles.
            {
                $graphLookup: {
                    from: 'users',
                    startWith: '$referrals.user',
                    connectFromField: 'referrals.user',
                    connectToField: '_id',
                    as: 'teamMembers',
                    maxDepth: 2, // 0-indexed: Nivel 1 (depth 0), Nivel 2 (depth 1), Nivel 3 (depth 2)
                    depthField: 'level'
                }
            },
            // 3. Descomponemos el array de miembros del equipo.
            { $unwind: '$teamMembers' },
            // 4. Agrupamos los resultados para sumar los totales y contar miembros por nivel.
            {
                $group: {
                    _id: null, // Agrupamos todo en un único documento de resultados.
                    totalTeamMembers: { $sum: 1 },
                    totalTeamRecharge: { $sum: '$teamMembers.totalRecharge' },
                    // [NEXUS REPORTING FIX] - Sumamos los retiros totales de forma correcta.
                    totalTeamWithdrawals: { $sum: '$teamMembers.totalWithdrawal' }, 
                    level1Members: { $sum: { $cond: [{ $eq: ['$teamMembers.level', 0] }, 1, 0] } },
                    level2Members: { $sum: { $cond: [{ $eq: ['$teamMembers.level', 1] }, 1, 0] } },
                    level3Members: { $sum: { $cond: [{ $eq: ['$teamMembers.level', 2] }, 1, 0] } },
                    // Contamos miembros válidos (que han depositado al menos una vez).
                    level1Valid: { $sum: { $cond: [{ $and: [ { $eq: ['$teamMembers.level', 0] }, { $gt: ['$teamMembers.totalRecharge', 0] } ] }, 1, 0] } },
                    level2Valid: { $sum: { $cond: [{ $and: [ { $eq: ['$teamMembers.level', 1] }, { $gt: ['$teamMembers.totalRecharge', 0] } ] }, 1, 0] } },
                    level3Valid: { $sum: { $cond: [{ $and: [ { $eq: ['$teamMembers.level', 2] }, { $gt: ['$teamMembers.totalRecharge', 0] } ] }, 1, 0] } }
                }
            },
            // 5. Proyectamos el resultado final en el formato que espera el frontend.
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
        
        const teamStatsResult = await User.aggregate(teamStatsPipeline);
        
        // Combinamos los resultados.
        const finalStats = {
            totalCommission,
            // Si el usuario no tiene equipo, teamStatsResult estará vacío.
            totalTeamMembers: teamStatsResult[0]?.totalTeamMembers || 0,
            totalTeamRecharge: teamStatsResult[0]?.totalTeamRecharge || 0,
            totalTeamWithdrawals: teamStatsResult[0]?.totalTeamWithdrawals || 0,
            levels: teamStatsResult[0]?.levels || [
                { level: 1, totalMembers: 0, validMembers: 0 },
                { level: 2, totalMembers: 0, validMembers: 0 },
                { level: 3, totalMembers: 0, validMembers: 0 },
            ],
        };

        res.json(finalStats);

    } catch (error) {
        console.error("Error al obtener estadísticas del equipo:", error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};


// La función getLevelDetails se mantiene igual, ya que su lógica es diferente
// y el método de populate anidado es aceptable para obtener una lista de usuarios.
const getLevelDetails = async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user.id);
        const requestedLevel = parseInt(req.params.level, 10);

        if (![1, 2, 3].includes(requestedLevel)) {
            return res.status(400).json({ message: 'Nivel no válido.' });
        }

        // Esta consulta es aceptable para esta funcionalidad específica.
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

        if (!user) {
            return res.json([]);
        }

        let levelMembers = [];
        if (requestedLevel === 1) {
            levelMembers = user.referrals.map(r => r.user);
        } else if (requestedLevel === 2) {
            user.referrals.forEach(r1 => {
                if (r1.user && r1.user.referrals) {
                    levelMembers.push(...r1.user.referrals.map(r2 => r2.user));
                }
            });
        } else if (requestedLevel === 3) {
            user.referrals.forEach(r1 => {
                if (r1.user && r1.user.referrals) {
                    r1.user.referrals.forEach(r2 => {
                        if (r2.user && r2.user.referrals) {
                            levelMembers.push(...r2.user.referrals.map(r3 => r3.user));
                        }
                    });
                }
            });
        }
        
        const finalResponse = levelMembers
            .filter(Boolean)
            .map(member => ({
                username: member.username,
                photoFileId: member.photoFileId,
            }));

        res.json(finalResponse);

    } catch (error) {
        console.error(`Error al obtener detalles del nivel ${req.params.level}:`, error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

module.exports = { getTeamStats, getLevelDetails };