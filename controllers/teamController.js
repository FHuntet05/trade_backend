// backend/controllers/teamController.js (COMPLETO Y REPARADO v21.20)

const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');
const mongoose = require('mongoose');

const getTeamStats = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    // --- INICIO DE LA CORRECCIÓN CLAVE ---
    // Simplificamos y corregimos la consulta. Eliminamos los 'select' restrictivos
    // que cortaban la cadena de referidos en el nivel 3.
    // Esta consulta ahora carga de forma fiable toda la jerarquía de 3 niveles.
    const user = await User.findById(userId).populate({
      path: 'referrals.user',
      populate: {
        path: 'referrals.user',
        populate: {
          path: 'referrals.user'
        }
      }
    });
    // --- FIN DE LA CORRECCIÓN CLAVE ---

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const stats = {
      totalTeamMembers: 0,
      totalCommission: 0,
      totalTeamRecharge: 0,
      totalTeamWithdrawals: 0,
      levels: [
        { level: 1, totalMembers: 0, validMembers: 0 },
        { level: 2, totalMembers: 0, validMembers: 0 },
        { level: 3, totalMembers: 0, validMembers: 0 },
      ],
    };

    // La lógica de iteración ahora funcionará porque 'user' contiene todos los datos.
    if (user.referrals && user.referrals.length > 0) {
      user.referrals.forEach(referralLvl1 => {
        const memberLvl1 = referralLvl1.user;
        if (!memberLvl1) return;
        stats.totalTeamMembers++;
        stats.levels[0].totalMembers++;
        if (memberLvl1.activeTools && memberLvl1.activeTools.length > 0) { stats.levels[0].validMembers++; }
        stats.totalTeamRecharge += memberLvl1.totalRecharge || 0;
        stats.totalTeamWithdrawals += memberLvl1.totalWithdrawal || 0;

        if (memberLvl1.referrals && memberLvl1.referrals.length > 0) {
          memberLvl1.referrals.forEach(referralLvl2 => {
            const memberLvl2 = referralLvl2.user;
            if (!memberLvl2) return;
            stats.totalTeamMembers++;
            stats.levels[1].totalMembers++;
            if (memberLvl2.activeTools && memberLvl2.activeTools.length > 0) { stats.levels[1].validMembers++; }
            stats.totalTeamRecharge += memberLvl2.totalRecharge || 0;
            stats.totalTeamWithdrawals += memberLvl2.totalWithdrawal || 0;

            if (memberLvl2.referrals && memberLvl2.referrals.length > 0) {
              memberLvl2.referrals.forEach(referralLvl3 => {
                const memberLvl3 = referralLvl3.user;
                if(!memberLvl3) return;
                stats.totalTeamMembers++;
                stats.levels[2].totalMembers++;
                if (memberLvl3.activeTools && memberLvl3.activeTools.length > 0) { stats.levels[2].validMembers++; }
                stats.totalTeamRecharge += memberLvl3.totalRecharge || 0;
                stats.totalTeamWithdrawals += memberLvl3.totalWithdrawal || 0;
              });
            }
          });
        }
      });
    }

    const commissionData = await Transaction.aggregate([
      { $match: { user: userId, type: 'commission' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    if (commissionData.length > 0) {
        stats.totalCommission = commissionData[0].total;
    }
    res.json(stats);
  } catch (error) {
    console.error("Error al obtener estadísticas del equipo:", error);
    res.status(500).json({ message: 'Error del servidor' });
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
      populate: {
        path: 'referrals.user',
        populate: {
          path: 'referrals.user'
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
        photoUrl: member.photoUrl,
        miningRate: parseFloat((member.effectiveMiningRate || 0).toFixed(2))
      }));

    res.json(finalResponse);

  } catch (error) {
    console.error(`Error al obtener detalles del nivel ${req.params.level}:`, error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

module.exports = { getTeamStats, getLevelDetails };