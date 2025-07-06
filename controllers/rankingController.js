// backend/controllers/rankingController.js
const User = require('../models/userModel');
const mongoose = require('mongoose');

const getRanking = async (req, res) => {
  const { type } = req.query;
  const currentUserId = new mongoose.Types.ObjectId(req.user.id);

  try {
    let rankingData;
    let currentUserData = {};

    if (type === 'individual') {
      // Ranking por saldo de NTX
      rankingData = await User.find({}, 'username balance.ntx')
        .sort({ 'balance.ntx': -1 })
        .limit(50)
        .lean(); // .lean() para un rendimiento más rápido

      const userRank = await User.countDocuments({ 'balance.ntx': { $gt: req.user.balance.ntx } });
      currentUserData = {
        rank: userRank + 1,
        score: req.user.balance.ntx.toFixed(2)
      };

    } else if (type === 'team') {
      // Ranking por tamaño de equipo (número de referidos)
      // Usamos una consulta de agregación para contar los referidos de cada usuario.
      const teamRanking = await User.aggregate([
        // Desenrollamos el array de usuarios para poder hacer un join con ellos mismos
        { $graphLookup: {
            from: 'users',
            startWith: '$_id',
            connectFromField: '_id',
            connectToField: 'referredBy',
            as: 'teamMembers'
          }
        },
        // Añadimos un campo 'teamSize' que es el tamaño del array de miembros
        { $addFields: {
            teamSize: { $size: '$teamMembers' }
          }
        },
        // Ordenamos por tamaño de equipo
        { $sort: { teamSize: -1 } },
        // Nos quedamos con los 50 primeros
        { $limit: 50 },
        // Proyectamos solo los campos que necesitamos
        { $project: {
            _id: 1,
            username: 1,
            score: '$teamSize' // Renombramos teamSize a score para consistencia
          }
        }
      ]);

      rankingData = teamRanking;

      // Encontrar el ranking del usuario actual en el ranking de equipos
      const userTeamData = teamRanking.find(team => team._id.equals(currentUserId));
      const userTeamIndex = teamRanking.findIndex(team => team._id.equals(currentUserId));
      
      currentUserData = {
        rank: userTeamIndex !== -1 ? userTeamIndex + 1 : '--', // Si no está en el top 50
        score: userTeamData ? userTeamData.score : (await User.countDocuments({ referredBy: currentUserId }))
      };

    } else {
      return res.status(400).json({ message: "Tipo de ranking no válido." });
    }

    res.json({ ranking: rankingData, userSummary: currentUserData });

  } catch (error) {
    console.error(`Error al obtener el ranking de tipo ${type}:`, error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

module.exports = { getRanking };