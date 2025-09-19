// backend/controllers/rankingController.js (VERSIÓN 4.0 - NEXUS RANKING FIX)
const User = require('../models/userModel');
const mongoose = require('mongoose');

// --- GENERADOR DE DATOS FICTICIOS (sin cambios) ---
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

// --- FUNCIÓN PRINCIPAL REFACTORIZADA Y CORREGIDA ---
const getRanking = async (req, res) => {
  const { type = 'global' } = req.query; // 'global' por defecto
  const currentUserId = req.user.id;

  try {
    let finalRanking = [];
    let userSummary = {};

    switch (type) {
      // --- CASO 1: RANKING GLOBAL FICTICIO ---
      case 'global': {
        const currentUser = await User.findById(currentUserId, 'username balance.ntx').lean();
        if (!currentUser) return res.status(404).json({ message: 'Usuario actual no encontrado.' });

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
      
      // ======================= INICIO DE LA CORRECCIÓN CRÍTICA =======================
      // --- CASO 2: RANKING DE EQUIPO (REFERIDOS) ---
      case 'team': {
        // Obtenemos al usuario actual y poblamos la información de sus referidos
        const currentUser = await User.findById(currentUserId, 'referrals')
                                      .populate({
                                        path: 'referrals.user',
                                        select: 'username balance.ntx', // Seleccionamos solo los campos necesarios
                                      })
                                      .lean();

        if (!currentUser) return res.status(404).json({ message: 'Usuario actual no encontrado.' });

        // Ordenamos el equipo por el balance NTX de cada miembro, de mayor a menor
        const sortedTeam = (currentUser.referrals || [])
            .filter(ref => ref.user) // Filtramos por si algún referido fue eliminado
            .sort((a, b) => (b.user.balance?.ntx || 0) - (a.user.balance?.ntx || 0));

        // Construimos el ranking a partir del equipo ordenado
        finalRanking = sortedTeam.slice(0, 50).map((member, index) => ({
            rank: index + 1,
            username: member.user.username,
            score: parseFloat((member.user.balance?.ntx || 0).toFixed(2)),
            isCurrentUser: false
        }));

        // Construimos el resumen del usuario con la métrica correcta
        userSummary = {
            rank: 1, // El usuario siempre es el #1 (líder) de su equipo
            score: currentUser.referrals.length, // La métrica principal es el número de miembros
            label: "Miembros" // La etiqueta correcta
        };
        break;
      }
      // ======================== FIN DE LA CORRECCIÓN CRÍTICA =========================

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