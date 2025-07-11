// backend/controllers/rankingController.js (CON RANKING FICTICIO CORREGIDO Y AMPLIADO)
const User = require('../models/userModel');
const mongoose = require('mongoose');

// --- AMPLIACIÓN: Listas de nombres extendidas para mayor variedad ---
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
  const dateSeed = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

  for (let i = 0; i < count; i++) {
    const seed = parseInt(dateSeed) + i;
    const username = 
      prefixes[Math.floor(seededRandom(seed * 10) * prefixes.length)] +
      nouns[Math.floor(seededRandom(seed * 20) * nouns.length)] +
      suffixes[Math.floor(seededRandom(seed * 30) * suffixes.length)];
    
    const score = 1000000 + Math.floor(seededRandom(seed * 40) * 4000000);

    // --- CORRECCIÓN CRÍTICA: Estructura de objeto corregida para coincidir con el modelo User ---
    ranking.push({
      _id: new mongoose.Types.ObjectId(),
      username,
      balance: { ntx: score }, // Ahora usa la estructura anidada correcta
      isFictitious: true
    });
  }
  return ranking.sort((a, b) => b.balance.ntx - a.balance.ntx);
};

const getRanking = async (req, res) => {
  try {
    const currentUserIdStr = req.user.id;
    const currentUser = await User.findById(currentUserIdStr, 'username balance.ntx').lean();

    if (!currentUser) {
        return res.status(404).json({ message: 'Usuario actual no encontrado.' });
    }

    let fakeRanking = generateFictitiousRanking(100);

    const fullList = [...fakeRanking, currentUser].sort((a, b) => (b.balance?.ntx || 0) - (a.balance?.ntx || 0));
    
    const userRank = fullList.findIndex(u => u._id.equals(currentUser._id)) + 1;

    fakeRanking = fakeRanking.filter(u => !u._id.equals(currentUser._id));
    
    if (userRank <= 50) {
      fakeRanking.splice(userRank - 1, 0, currentUser);
    }
    
    const finalRanking = fakeRanking.slice(0, 50).map((user, index) => ({
        rank: index + 1,
        username: user.username,
        score: parseFloat((user.balance?.ntx || 0).toFixed(2)),
    }));

    res.json({
        ranking: finalRanking,
        userSummary: {
            rank: userRank,
            username: currentUser.username,
            score: parseFloat((currentUser.balance?.ntx || 0).toFixed(2)),
        }
    });

  } catch (error) {
    console.error(`Error al obtener el ranking ficticio:`, error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

module.exports = { getRanking };