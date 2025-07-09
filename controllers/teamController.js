// backend/controllers/teamController.js (VERSIÓN FINAL CON LÓGICA DE DATOS CORRECTA)
const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');
const mongoose = require('mongoose');

const getTeamStats = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    // --- LÓGICA MEJORADA: OBTENER COMISIONES DE LA FUENTE DE VERDAD (TRANSACCIONES) ---
    const commissionData = await Transaction.aggregate([
      { $match: { user: userId, type: 'commission' } },
      { $group: { _id: null, totalCommission: { $sum: '$amount' } } }
    ]);
    const totalCommission = commissionData.length > 0 ? commissionData[0].totalCommission : 0;
    
    // --- LÓGICA MEJORADA: OBTENER ESTADÍSTICAS DEL EQUIPO CON $graphLookup ---
    const teamData = await User.aggregate([
      { $match: { _id: userId } },
      {
        $graphLookup: {
          from: 'users',
          startWith: '$referrals.user', // Empezamos desde la lista de referidos directos
          connectFromField: 'referrals.user',
          connectToField: '_id',
          as: 'teamMembers',
          depthField: 'level',
          restrictSearchWithMatch: { level: { $lte: 2 } } // Buscamos hasta 3 niveles (0, 1, 2)
        }
      },
      { $unwind: '$teamMembers' },
      {
        $project: {
          level: { $add: ['$teamMembers.level', 1] }, // Nivel 0 es 1, 1 es 2, etc.
          totalRecharge: { $ifNull: ["$teamMembers.totalRecharge", 0] }, // Asumiendo que este campo existe
          totalWithdrawal: { $ifNull: ["$teamMembers.totalWithdrawal", 0] } // Asumiendo que este campo existe
        }
      },
      {
        $group: {
          _id: '$level',
          members: { $sum: 1 },
          totalTeamRecharge: { $sum: '$totalRecharge' },
          totalTeamWithdrawals: { $sum: '$totalWithdrawal' }
        }
      }
    ]);

    const levels = [
      { level: 1, members: 0, commission: 0 }, // La comisión por nivel se simplifica
      { level: 2, members: 0, commission: 0 },
      { level: 3, members: 0, commission: 0 },
    ];
    
    let totalTeamMembers = 0;
    let totalTeamRecharge = 0;
    let totalTeamWithdrawals = 0;

    teamData.forEach(levelInfo => {
      if (levelInfo._id <= 3) {
        levels[levelInfo._id - 1].members = levelInfo.members;
        totalTeamMembers += levelInfo.members;
        totalTeamRecharge += levelInfo.totalTeamRecharge;
        totalTeamWithdrawals += levelInfo.totalTeamWithdrawals;
      }
    });

    const stats = {
      totalTeamMembers,
      totalCommission: parseFloat(totalCommission.toFixed(2)),
      totalTeamRecharge: parseFloat(totalTeamRecharge.toFixed(2)),
      totalTeamWithdrawals: parseFloat(totalTeamWithdrawals.toFixed(2)),
      levels: levels, // Ya no necesitamos calcular la comisión aquí
    };

    res.json(stats);
  } catch (error) {
    console.error("Error al obtener estadísticas del equipo:", error);
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
                // Buscamos exactamente el nivel - 1 (porque depthField empieza en 0)
                restrictSearchWithMatch: { 'level': requestedLevel - 1 }
            }
        },
        { $unwind: '$team' },
        // Filtramos para quedarnos solo con los miembros del nivel exacto
        { $match: { 'team.level': requestedLevel - 1 } },
        {
            $project: {
                _id: '$team._id',
                username: '$team.username',
                photoUrl: '$team.photoUrl',
                // Leemos el valor pre-calculado y almacenado. Mucho más eficiente.
                miningRate: '$team.effectiveMiningRate' 
            }
        }
    ]);
    
    // El frontend espera 'miningRate', así que lo mantenemos.
    const finalResponse = teamMembers.map(member => ({
        username: member.username,
        photoUrl: member.photoUrl,
        // Aseguramos que el valor sea un número y lo formateamos
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