// backend/controllers/teamController.js
const User = require('../models/userModel');
const mongoose = require('mongoose');

// --- Tasas de comisión por nivel ---
// Es una buena práctica definir estos valores como constantes para fácil mantenimiento.
const COMMISSION_RATES = {
  LEVEL_1: 0.10, // 10%
  LEVEL_2: 0.05, // 5%
  LEVEL_3: 0.02, // 2%
};

// @desc    Obtener las estadísticas del equipo del usuario
// @route   GET /api/team/stats
const getTeamStats = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const teamData = await User.aggregate([
      { $match: { _id: userId } },
      {
        $graphLookup: {
          from: 'users',
          startWith: '$_id',
          connectFromField: '_id',
          connectToField: 'referredBy',
          as: 'teamMembers',
          depthField: 'level' 
        }
      },
      // MODIFICADO: Proyectamos más campos para nuestros cálculos
      {
        $project: {
          teamMembers: {
            level: 1,
            // Asumimos que el modelo de usuario tiene estos campos.
            // Usamos $ifNull para evitar errores si los campos no existen en un documento.
            totalRecharge: { $ifNull: ["$totalRecharge", 0] },
            totalWithdrawal: { $ifNull: ["$totalWithdrawal", 0] },
          }
        }
      }
    ]);

    if (!teamData || teamData.length === 0 || teamData[0].teamMembers.length === 0) {
      return res.json({
        totalTeamMembers: 0,
        totalCommission: 0,
        totalTeamRecharge: 0,
        totalTeamWithdrawals: 0,
        levels: [
          { level: 1, members: 0, commission: 0 },
          { level: 2, members: 0, commission: 0 },
          { level: 3, members: 0, commission: 0 },
        ]
      });
    }

    const members = teamData[0].teamMembers;

    // --- CÁLCULOS AGREGADOS ---
    const totalTeamRecharge = members.reduce((sum, m) => sum + m.totalRecharge, 0);
    const totalTeamWithdrawals = members.reduce((sum, m) => sum + m.totalWithdrawal, 0);

    let totalCommission = 0;
    const levels = [
        { level: 1, members: 0, commission: 0 },
        { level: 2, members: 0, commission: 0 },
        { level: 3, members: 0, commission: 0 },
    ];

    members.forEach(member => {
      // El nivel de $graphLookup es 0-indexed (0, 1, 2...), así que lo ajustamos.
      const currentLevel = member.level + 1;
      let commissionFromMember = 0;

      if (currentLevel === 1) {
        levels[0].members++;
        commissionFromMember = member.totalRecharge * COMMISSION_RATES.LEVEL_1;
        levels[0].commission += commissionFromMember;
      } else if (currentLevel === 2) {
        levels[1].members++;
        commissionFromMember = member.totalRecharge * COMMISSION_RATES.LEVEL_2;
        levels[1].commission += commissionFromMember;
      } else if (currentLevel === 3) {
        levels[2].members++;
        commissionFromMember = member.totalRecharge * COMMISSION_RATES.LEVEL_3;
        levels[2].commission += commissionFromMember;
      }
      totalCommission += commissionFromMember;
    });

    const stats = {
      totalTeamMembers: members.length,
      totalCommission: parseFloat(totalCommission.toFixed(2)),
      totalTeamRecharge: parseFloat(totalTeamRecharge.toFixed(2)),
      totalTeamWithdrawals: parseFloat(totalTeamWithdrawals.toFixed(2)),
      levels: levels.map(l => ({
        ...l,
        commission: parseFloat(l.commission.toFixed(2))
      })),
    };

    res.json(stats);
  } catch (error) {
    console.error("Error al obtener estadísticas del equipo:", error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};
// @desc    Obtener los detalles de los miembros de un nivel específico
// @route   GET /api/team/level-details/:level
const getLevelDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const requestedLevel = parseInt(req.params.level, 10);

    if (![1, 2, 3].includes(requestedLevel)) {
      return res.status(400).json({ message: 'Nivel no válido. Debe ser 1, 2 o 3.' });
    }

    let teamMemberIds = [userId];
    
    // Bucle para llegar al nivel deseado
    // Para Nivel 1, el bucle corre 1 vez. Para Nivel 2, 2 veces, etc.
    for (let i = 0; i < requestedLevel; i++) {
      const directReferrals = await User.find({ referredBy: { $in: teamMemberIds } }).select('_id');
      if (directReferrals.length === 0) {
        teamMemberIds = []; // No hay más referidos en la cadena
        break;
      }
      teamMemberIds = directReferrals.map(u => u._id);
    }
    
    if (teamMemberIds.length === 0) {
      return res.json([]); // Devuelve un array vacío si no hay miembros en ese nivel
    }

    // Ahora que tenemos los IDs de los miembros del nivel correcto,
    // buscamos sus datos y populamos sus herramientas para calcular el 'effectiveMiningRate'.
    const membersDetails = await User.find({ _id: { $in: teamMemberIds } })
                                     .populate('activeTools.tool')
                                     .select('username effectiveMiningRate'); // Solo seleccionamos los campos necesarios

    // El campo virtual 'effectiveMiningRate' ya se calcula automáticamente gracias a la populación.
    // Mapeamos para limpiar la respuesta y asegurar que el campo virtual esté presente.
    const finalResponse = membersDetails.map(member => ({
      username: member.username,
      miningRate: parseFloat(member.effectiveMiningRate.toFixed(2)) // Usamos toFixed para redondear
    }));

    res.json(finalResponse);

  } catch (error) {
    console.error(`Error al obtener detalles del nivel ${req.params.level}:`, error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

module.exports = { getTeamStats, getLevelDetails };