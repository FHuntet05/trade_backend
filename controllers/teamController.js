// RUTA: backend/controllers/teamController.js (VERSIÓN "NEXUS - DATA INTEGRITY OVERHAUL")

const User = require('../models/userModel');
const Transaction = require('../models/transactionModel'); // [NEXUS OVERHAUL] - Importamos el modelo Transaction.
const mongoose = require('mongoose');

const getTeamStats = async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user.id);

        // --- PASO 1: Obtener la estructura completa del equipo (miembros y niveles) ---
        // Usamos $graphLookup para obtener todos los miembros hasta 3 niveles de profundidad.
        const teamStructurePipeline = [
            { $match: { _id: userId } },
            {
                $graphLookup: {
                    from: 'users',
                    startWith: '$referrals.user',
                    connectFromField: 'referrals.user',
                    connectToField: '_id',
                    as: 'teamMembers',
                    maxDepth: 2, // 0-indexed, así que 2 significa 3 niveles.
                    depthField: 'level'
                }
            },
            { $unwind: { path: "$teamMembers", preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: "$_id",
                    teamMemberIds: { $addToSet: "$teamMembers._id" }, // Lista de IDs para la siguiente consulta
                    totalTeamMembers: { $sum: { $cond: ["$teamMembers._id", 1, 0] } },
                    level1Members: { $sum: { $cond: [{ $eq: ['$teamMembers.level', 0] }, 1, 0] } },
                    level2Members: { $sum: { $cond: [{ $eq: ['$teamMembers.level', 1] }, 1, 0] } },
                    level3Members: { $sum: { $cond: [{ $eq: ['$teamMembers.level', 2] }, 1, 0] } },
                    level1Valid: { $sum: { $cond: [{ $and: [ { $eq: ['$teamMembers.level', 0] }, { $gt: ['$teamMembers.totalRecharge', 0] } ] }, 1, 0] } },
                    level2Valid: { $sum: { $cond: [{ $and: [ { $eq: ['$teamMembers.level', 1] }, { $gt: ['$teamMembers.totalRecharge', 0] } ] }, 1, 0] } },
                    level3Valid: { $sum: { $cond: [{ $and: [ { $eq: ['$teamMembers.level', 2] }, { $gt: ['$teamMembers.totalRecharge', 0] } ] }, 1, 0] } }
                }
            }
        ];
        
        const teamStructureResult = await User.aggregate(teamStructurePipeline);

        if (teamStructureResult.length === 0 || !teamStructureResult[0].teamMemberIds) {
            // Caso borde: El usuario no tiene equipo. Devolvemos ceros.
            return res.json({
                totalCommission: 0,
                totalTeamMembers: 0,
                totalTeamRecharge: 0,
                totalWithdrawals: 0,
                levels: [
                    { level: 1, totalMembers: 0, validMembers: 0 },
                    { level: 2, totalMembers: 0, validMembers: 0 },
                    { level: 3, totalMembers: 0, validMembers: 0 },
                ],
            });
        }
        
        const teamData = teamStructureResult[0];
        const teamMemberIds = teamData.teamMemberIds.filter(id => id); // Filtramos nulos si los hubiera

        // --- PASO 2: Realizar una única consulta de agregación sobre la colección Transaction ---
        // Esta es ahora la ÚNICA FUENTE DE VERDAD para los datos monetarios.
        const transactionStatsPipeline = [
            { $match: { user: { $in: teamMemberIds } } }, // Filtramos solo transacciones de miembros del equipo
            {
                $facet: {
                    // Calculamos la comisión total del equipo
                    totalCommission: [
                        { $match: { type: 'commission' } },
                        { $group: { _id: null, total: { $sum: '$amount' } } }
                    ],
                    // Calculamos las recargas totales del equipo
                    totalTeamRecharge: [
                        { $match: { type: 'deposit', status: 'completed' } },
                        { $group: { _id: null, total: { $sum: '$amount' } } }
                    ],
                    // Calculamos los retiros totales del equipo
                    totalWithdrawals: [
                        { $match: { type: 'withdrawal', status: 'completed' } },
                        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } } // Usamos valor absoluto para retiros
                    ]
                }
            }
        ];
        
        const transactionResults = await Transaction.aggregate(transactionStatsPipeline);
        const monetaryStats = transactionResults[0];

        // --- PASO 3: Consolidar y devolver la respuesta final ---
        // Extraemos los valores, manejando el caso de que una categoría no tenga transacciones.
        const finalResponse = {
            totalCommission: monetaryStats.totalCommission[0]?.total || 0,
            totalTeamMembers: teamData.totalTeamMembers,
            totalTeamRecharge: monetaryStats.totalTeamRecharge[0]?.total || 0,
            totalWithdrawals: monetaryStats.totalWithdrawals[0]?.total || 0,
            levels: [
                { level: 1, totalMembers: teamData.level1Members, validMembers: teamData.level1Valid },
                { level: 2, totalMembers: teamData.level2Members, validMembers: teamData.level2Valid },
                { level: 3, totalMembers: teamData.level3Members, validMembers: teamData.level3Valid },
            ]
        };

        res.json(finalResponse);

    } catch (error) {
        console.error("Error al obtener estadísticas del equipo:", error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

const getLevelDetails = async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user.id);
        const requestedLevel = parseInt(req.params.level, 10);
        if (![1, 2, 3].includes(requestedLevel)) { return res.status(400).json({ message: 'Nivel no válido.' }); }
        const user = await User.findById(userId).populate({ path: 'referrals.user', select: 'username photoFileId referrals', populate: { path: 'referrals.user', select: 'username photoFileId referrals', populate: { path: 'referrals.user', select: 'username photoFileId' } } });
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