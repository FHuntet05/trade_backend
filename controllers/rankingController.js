// backend/controllers/rankingController.js (VERSIÓN 2.0 - REFORZADA)
const User = require('../models/userModel');
const mongoose = require('mongoose');

// Listas de nombres extendidas (sin cambios)
const prefixes = [
    'Shadow', 'Cyber', 'Neon', 'Ghost', 'Psycho', 'Void', 'Hyper', 'Dark', 'Iron', 'Omega', 'Crypto', 'Quantum',
    'Astro', 'Rogue', 'Titan', 'Zenith', 'Nova', 'Pulse', 'Warp', 'Drift', 'Apex', 'Blitz', 'Echo', 'Fury'
];
const nouns = [
    'Wolf', 'Striker', 'Phoenix', 'Reaper', 'Blade', 'Hunter', 'Dragon', 'Viper', 'Knight', 'Spectre', 'Pioneer', 'Lord',
    'Jester', 'Guardian', 'Beast', 'Wraith', 'Golem', 'Warden', 'Saint', 'Shark', 'Cobra', 'Falcon', 'King', 'Sensei'
];
const suffixes = [
    '99', 'xX', 'Pro', 'EXE', 'Z', 'HD', 'Prime', 'Zero', 'GG', 'MKII', '2K', 'Max', 'YT', 'One', 'NFT', 'BTC',
    'ETH', 'IO', 'AI', 'Bot', 'OG', 'Legacy', 'God', 'Art'
];

const seededRandom = (seed) => {
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

const generateFictitiousRanking = (count = 100) => {
  const ranking = [];
  const dateSeed = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  for (let i = 0; i < count; i++) {
    const seed = parseInt(dateSeed) + i;
    const username = 
      prefixes[Math.floor(seededRandom(seed * 10) * prefixes.length)] +
      nouns[Math.floor(seededRandom(seed * 20) * nouns.length)] +
      suffixes[Math.floor(seededRandom(seed * 30) * suffixes.length)];
    
    const score = 1000000 + Math.floor(seededRandom(seed * 40) * 4000000);

    ranking.push({
      _id: new mongoose.Types.ObjectId(),
      username,
      balance: { ntx: score },
      isFictitious: true
    });
  }
  return ranking.sort((a, b) => b.balance.ntx - a.balance.ntx);
};

const getRanking = async (req, res) => {
  try {
    const currentUserIdStr = req.user.id;
    // Solo traemos los campos necesarios para este endpoint
    const currentUser = await User.findById(currentUserIdStr, 'username balance.ntx').lean();

    if (!currentUser) {
        return res.status(404).json({ message: 'Usuario actual no encontrado.' });
    }

    let fakeRanking = generateFictitiousRanking(100);

    // --- LÓGICA DE UNIÓN Y ORDENACIÓN SIMPLIFICADA ---
    // Nos aseguramos de que todos los objetos en la lista tengan la misma estructura antes de ordenar.
    const getScore = (user) => user?.balance?.ntx || 0;

    const fullList = [...fakeRanking, currentUser].sort((a, b) => getScore(b) - getScore(a));
    
    const userRank = fullList.findIndex(u => u._id.equals(currentUser._id)) + 1;
    
    // --- LÓGICA DE MAPEO A PRUEBA DE ERRORES ---
    // Mapeamos a la estructura final DESPUÉS de toda la lógica de ordenación.
    const finalRanking = fullList.slice(0, 50).map((user, index) => ({
        rank: index + 1,
        username: user.username,
        score: parseFloat(getScore(user).toFixed(2)),
    }));

    res.json({
        ranking: finalRanking,
        userSummary: {
            rank: userRank,
            username: currentUser.username,
            score: parseFloat(getScore(currentUser).toFixed(2)),
        }
    });

  } catch (error) {
    console.error(`Error al obtener el ranking ficticio:`, error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

module.exports = { getRanking };