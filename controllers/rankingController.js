// backend/controllers/rankingController.js (VERSIÓN 3.0 - LÓGICA SEPARADA Y CORREGIDA)
const User = require('../models/userModel');
const mongoose = require('mongoose');

// --- GENERADOR DE DATOS FICTICIOS (sin cambios, pero incluido para completitud) ---
const prefixes = ['Shadow', 'Cyber', 'Neon', 'Ghost', 'Psycho', 'Void', 'Hyper', 'Dark', 'Iron', 'Omega', 'Crypto', 'Quantum', 'Astro', 'Rogue', 'Titan', 'Zenith', 'Nova', 'Pulse', 'Warp', 'Drift', 'Apex', 'Blitz', 'Echo', 'Fury'];
const nouns = ['Wolf', 'Striker', 'Phoenix', 'Reaper', 'Blade', 'Hunter', 'Dragon', 'Viper', 'Knight', 'Spectre', 'Pioneer', 'Lord', 'Jester', 'Guardian', 'Beast', 'Wraith', 'Golem', 'Warden', 'Saint', 'Shark', 'Cobra', 'Falcon', 'King', 'Sensei'];
const suffixes = ['99', 'xX', 'Pro', 'EXE', 'Z', 'HD', 'Prime', 'Zero', 'GG', 'MKII', '2K', 'Max', 'YT', 'One', 'NFT', 'BTC', 'ETH', 'IO', 'AI', 'Bot', 'OG', 'Legacy', 'God', 'Art'];

const seededRandom = (seed) => {
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

const generateFictitiousRanking = (count = 100) => {
  const ranking = [];
  const dateSeed = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  for (let i = 0; i < count; i++) {
    const seed = parseInt(dateSeed) + i;
    const username = prefixes[Math.floor(seededRandom(seed * 10) * prefixes.length)] + nouns[Math.floor(seededRandom(seed * 20) * nouns.length)] + suffixes[Math.floor(seededRandom(seed * 30) * suffixes.length)];
    const score = 1000000 + Math.floor(seededRandom(seed * 40) * 4000000);
    ranking.push({ _id: new mongoose.Types.ObjectId(), username, balance: { ntx: score } });
  }
  return ranking.sort((a, b) => b.balance.ntx - a.balance.ntx);
};

// --- FUNCIÓN PRINCIPAL REFACTORIZADA ---
const getRanking = async (req, res) => {
  const { type = 'global' } = req.query; // 'global' por defecto
  const currentUserId = req.user.id;

  try {
    const currentUser = await User.findById(currentUserId, 'username balance.ntx').lean();
    if (!currentUser) return res.status(404).json({ message: 'Usuario actual no encontrado.' });

    let finalRanking = [];
    let userSummary = {};

    switch (type) {
      // --- CASO 1: RANKING GLOBAL FICTICIO ---
      case 'global': {
        const fakeRanking = generateFictitiousRanking(100);
        const fullList = [...fakeRanking, currentUser].sort((a, b) => (b.balance?.ntx || 0) - (a.balance?.ntx || 0));
        const userRank = fullList.findIndex(u => u._id.equals(currentUser._id)) + 1;
        
        finalRanking = fullList.slice(0, 50).map((user, index) => ({
          rank: index + 1,
          username: user.username,
          score: parseFloat((user.balance?.ntx || 0).toFixed(2)),
          isCurrentUser: user._id.equals(currentUser._id)
        }));

        userSummary = {
          rank: userRank,
          score: parseFloat((currentUser.balance?.ntx || 0).toFixed(2)),
          label: "Mi Cantidad"
        };
        break;
      }
      
      // --- CASO 2: RANKING DE EQUIPO (REFERIDOS) ---
      case 'team': {
        const teamMembers = await User.find({ referredBy: currentUserId }, 'username effectiveMiningRate')
                                        .sort({ effectiveMiningRate: -1 })
                                        .limit(50)
                                        .lean();

        finalRanking = teamMembers.map((member, index) => ({
            rank: index + 1,
            username: member.username,
            score: parseFloat((member.effectiveMiningRate || 0).toFixed(2)),
            isCurrentUser: false
        }));

        userSummary = {
            rank: teamMembers.length, // Total de referidos directos
            score: currentUser.balance?.ntx || 0, // Mantenemos la puntuación global del usuario
            label: "Miembros"
        };
        break;
      }

      default:
        return res.status(400).json({ message: 'Tipo de ranking no válido.' });
    }

    res.json({ ranking: finalRanking, userSummary });

  } catch (error) {
    console.error(`Error al obtener el ranking (tipo: ${type}):`, error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

module.exports = { getRanking };