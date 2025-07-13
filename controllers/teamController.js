// --- START OF FILE backend/controllers/teamController.js (VERSIÓN COMPLETA Y FUNCIONAL) ---

const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');
const mongoose = require('mongoose');

const getTeamStats = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    // Obtenemos al usuario y populamos su lista de referidos hasta 3 niveles de profundidad.
    const user = await User.findById(userId).populate({
      path: 'referrals.user',
      select: 'telegramId activeTools totalRecharge totalWithdrawal referrals',
      populate: {
        path: 'referrals.user',
        select: 'telegramId activeTools totalRecharge totalWithdrawal referrals',
        populate: {
          path: 'referrals.user',
          select: 'telegramId activeTools totalRecharge totalWithdrawal'
        }
      }
    });

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const stats = {
      totalTeamMembers: 0,
      totalCommission: 0, // Este valor se puede calcular por separado si es necesario.
      totalTeamRecharge: 0,
      totalTeamWithdrawals: 0,
      levels: [
        { level: 1, totalMembers: 0, validMembers: 0 },
        { level: 2, totalMembers: 0, validMembers: 0 },
        { level: 3, totalMembers: 0, validMembers: 0 },
      ],
    };

    // Procesamos el Nivel 1 de referidos
    if (user.referrals && user.referrals.length > 0) {
      stats.levels[0].totalMembers = user.referrals.length;
      user.referrals.forEach(referralLvl1 => {
        const memberLvl1 = referralLvl1.user;
        if (!memberLvl1) return;

        stats.totalTeamMembers++;
        if (memberLvl1.activeTools && memberLvl1.activeTools.length > 0) {
          stats.levels[0].validMembers++;
        }
        stats.totalTeamRecharge += memberLvl1.totalRecharge || 0;
        stats.totalTeamWithdrawals += memberLvl1.totalWithdrawal || 0;

        // Procesamos el Nivel 2 de referidos
        if (memberLvl1.referrals && memberLvl1.referrals.length > 0) {
          stats.levels[1].totalMembers += memberLvl1.referrals.length;
          memberLvl1.referrals.forEach(referralLvl2 => {
            const memberLvl2 = referralLvl2.user;
            if (!memberLvl2) return;

            stats.totalTeamMembers++;
            if (memberLvl2.activeTools && memberLvl2.activeTools.length > 0) {
              stats.levels[1].validMembers++;
            }
            stats.totalTeamRecharge += memberLvl2.totalRecharge || 0;
            stats.totalTeamWithdrawals += memberLvl2.totalWithdrawal || 0;

            // Procesamos el Nivel 3 de referidos
            if (memberLvl2.referrals && memberLvl2.referrals.length > 0) {
              stats.levels[2].totalMembers += memberLvl2.referrals.length;
              memberLvl2.referrals.forEach(referralLvl3 => {
                const memberLvl3 = referralLvl3.user;
                if(!memberLvl3) return;

                stats.totalTeamMembers++;
                if (memberLvl3.activeTools && memberLvl3.activeTools.length > 0) {
                    stats.levels[2].validMembers++;
                }
                stats.totalTeamRecharge += memberLvl3.totalRecharge || 0;
                stats.totalTeamWithdrawals += memberLvl3.totalWithdrawal || 0;
              });
            }
          });
        }
      });
    }

    // Aquí se puede agregar la lógica para calcular la comisión total si se requiere
    // Por ejemplo, consultando el modelo de transacciones.
    const commissionData = await Transaction.aggregate([
      { $match: { user: userId, type: 'commission' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    if (commissionData.length > 0) {
        stats.totalCommission = commissionData[0].total;
    }

    res.json(stats);

  } catch (error) {
    console.error("Error al obtener estadísticas del equipo (versión completa):", error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};


const getLevelDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const requestedLevel = parseInt(req.params.level, 10);

    if (![1, 2, 3].includes(requestedLevel)) {
      return res.status(400).json({ message: 'Nivel no válido.' });
    }

    // Usamos $graphLookup para encontrar los miembros del nivel solicitado de forma eficiente
    const teamMembers = await User.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(userId) } },
        {
            $graphLookup: {
                from: 'users',
                startWith: '$referrals.user',
                connectFromField: 'referrals.user',
                connectToField: '_id',
                as: 'team',
                depthField: 'level',
                restrictSearchWithMatch: { 'level': requestedLevel - 1 }
            }
        },
        { $unwind: '$team' },
        { $match: { 'team.level': requestedLevel - 1 } },
        {
            $project: {
                _id: '$team._id',
                username: '$team.username',
                photoUrl: '$team.photoUrl',
                miningRate: '$team.effectiveMiningRate' 
            }
        }
    ]);
    
    const finalResponse = teamMembers.map(member => ({
        username: member.username,
        photoUrl: member.photoUrl,
        miningRate: parseFloat((member.miningRate || 0).toFixed(2))
    }));

    res.json(finalResponse);

  } catch (error)
  {
    console.error(`Error al obtener detalles del nivel ${req.params.level}:`, error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

module.exports = { getTeamStats, getLevelDetails };

// --- END OF FILE backend/controllers/teamController.js ---