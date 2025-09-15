// backend/controllers/teamController.js (FASE "PERFECTIO" - LÓGICA DE NEGOCIO CORREGIDA)

const User = require('../models/userModel');
const mongoose = require('mongoose');

// Función auxiliar recursiva para procesar los niveles de referidos
const processReferrals = (members, level, maxLevel, stats) => {
    if (level > maxLevel || !members) {
        return;
    }

    members.forEach(referral => {
        const member = referral.user;
        if (!member) return;

        stats.totalTeamMembers++;
        stats.levels[level - 1].totalMembers++;
        // [PERFECTIO - LÓGICA CORREGIDA] Un "miembro válido" es quien ha recargado.
        if (member.totalRecharge > 0) {
            stats.levels[level - 1].validMembers++;
        }
        
        stats.totalTeamRecharge += member.totalRecharge || 0;
        stats.totalTeamWithdrawals += member.totalWithdrawal || 0;

        // Procesar el siguiente nivel
        processReferrals(member.referrals, level + 1, maxLevel, stats);
    });
};

const getTeamStats = async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user.id);

        // [PERFECTIO - CONSULTA CORREGIDA]
        // Esta consulta ahora carga de forma fiable toda la jerarquía de 3 niveles
        // y selecciona solo los campos necesarios para optimizar el rendimiento.
        const user = await User.findById(userId).populate({
            path: 'referrals.user',
            select: 'totalRecharge totalWithdrawal referrals', // Campos necesarios para el cálculo
            populate: {
                path: 'referrals.user',
                select: 'totalRecharge totalWithdrawal referrals',
                populate: {
                    path: 'referrals.user',
                    select: 'totalRecharge totalWithdrawal referrals'
                }
            }
        });

        if (!user) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        const stats = {
            totalTeamMembers: 0,
            totalTeamRecharge: 0,
            totalTeamWithdrawals: 0,
            // [PERFECTIO - LÓGICA CORREGIDA] Se calcula el total de comisiones del propio usuario.
            totalCommission: user.transactions
                                 .filter(tx => tx.type === 'referral_commission')
                                 .reduce((sum, tx) => sum + tx.amount, 0),
            levels: [
                { level: 1, totalMembers: 0, validMembers: 0 },
                { level: 2, totalMembers: 0, validMembers: 0 },
                { level: 3, totalMembers: 0, validMembers: 0 },
            ],
        };

        // La función recursiva procesa los 3 niveles
        processReferrals(user.referrals, 1, 3, stats);

        res.json(stats);

    } catch (error) {
        console.error("Error al obtener estadísticas del equipo:", error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

const getLevelDetails = async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user.id);
        const requestedLevel = parseInt(req.params.level, 10);

        if (![1, 2, 3].includes(requestedLevel)) {
            return res.status(400).json({ message: 'Nivel no válido.' });
        }

        const user = await User.findById(userId).populate({
            path: 'referrals.user',
            select: 'username photoFileId referrals', // Solo los campos necesarios
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
        
        // La obtención de la URL de la foto se delega al frontend o a un endpoint específico
        // para no sobrecargar esta consulta.
        const finalResponse = levelMembers
            .filter(Boolean) // Filtra cualquier posible nulo
            .map(member => ({
                username: member.username,
                photoFileId: member.photoFileId, // Enviamos el ID para que el frontend pueda construir la URL
            }));

        res.json(finalResponse);

    } catch (error) {
        console.error(`Error al obtener detalles del nivel ${req.params.level}:`, error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

module.exports = { getTeamStats, getLevelDetails };