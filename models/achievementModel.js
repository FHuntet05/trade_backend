const mongoose = require('mongoose');

const missionSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    enum: ['daily', 'weekly', 'achievement'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  requirements: {
    type: [{
      type: {
        type: String,
        enum: [
          'trade', 'deposit', 'referral', 'spin', 'login',
          'volume', 'streak', 'level', 'nft', 'social'
        ]
      },
      value: Number,
      progress: {
        type: Number,
        default: 0
      }
    }],
    required: true
  },
  rewards: {
    xp: Number,
    ntx: Number,
    usdt: Number,
    spins: Number,
    nftId: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  startDate: Date,
  endDate: Date
}, {
  timestamps: true
});

const achievementSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  icon: String,
  category: {
    type: String,
    enum: ['trading', 'social', 'collection', 'special'],
    required: true
  },
  requirements: {
    type: [{
      type: {
        type: String,
        enum: [
          'trade_count', 'trade_volume', 'profit_target',
          'referral_count', 'login_streak', 'wheel_spins',
          'nft_collection', 'level_reached'
        ]
      },
      value: Number
    }],
    required: true
  },
  rewards: {
    xp: Number,
    ntx: Number,
    usdt: Number,
    nftId: String,
    badgeId: String
  },
  rarity: {
    type: String,
    enum: ['common', 'rare', 'epic', 'legendary'],
    required: true
  },
  isHidden: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const userProgressSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  missions: [{
    missionId: {
      type: String,
      required: true
    },
    progress: [{
      requirementIndex: Number,
      currentValue: Number,
      completed: Boolean
    }],
    claimed: {
      type: Boolean,
      default: false
    },
    completedAt: Date
  }],
  achievements: [{
    achievementId: {
      type: String,
      required: true
    },
    progress: [{
      requirementIndex: Number,
      currentValue: Number
    }],
    unlockedAt: Date
  }],
  stats: {
    totalTradeCount: { type: Number, default: 0 },
    totalTradeVolume: { type: Number, default: 0 },
    highestProfit: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    totalSpins: { type: Number, default: 0 },
    nftCollected: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Índices
missionSchema.index({ type: 1, isActive: 1 });
missionSchema.index({ startDate: 1, endDate: 1 });
achievementSchema.index({ category: 1, isActive: 1 });
userProgressSchema.index({ user: 1 });
userProgressSchema.index({ 'missions.missionId': 1 });
userProgressSchema.index({ 'achievements.achievementId': 1 });

// Métodos estáticos para Mission
missionSchema.statics.getActiveMissions = async function(type = 'daily') {
  const now = new Date();
  return this.find({
    type,
    isActive: true,
    $or: [
      { startDate: { $exists: false } },
      {
        startDate: { $lte: now },
        endDate: { $gte: now }
      }
    ]
  });
};

// Métodos para UserProgress
userProgressSchema.methods.updateProgress = async function(type, value) {
  const missions = await mongoose.model('Mission').getActiveMissions();
  const achievements = await mongoose.model('Achievement').find({ isActive: true });
  
  // Actualizar progreso de misiones
  for (const mission of missions) {
    const missionProgress = this.missions.find(m => m.missionId === mission.id);
    if (!missionProgress) continue;

    for (const [index, req] of mission.requirements.entries()) {
      if (req.type === type) {
        const progress = missionProgress.progress.find(p => p.requirementIndex === index);
        if (progress) {
          progress.currentValue += value;
          progress.completed = progress.currentValue >= req.value;
        }
      }
    }
  }

  // Actualizar progreso de logros
  for (const achievement of achievements) {
    const achievementProgress = this.achievements.find(a => a.achievementId === achievement.id);
    if (!achievementProgress) continue;

    for (const [index, req] of achievement.requirements.entries()) {
      if (req.type === type) {
        const progress = achievementProgress.progress.find(p => p.requirementIndex === index);
        if (progress) {
          progress.currentValue += value;
          if (progress.currentValue >= req.value && !achievementProgress.unlockedAt) {
            achievementProgress.unlockedAt = new Date();
            // Emitir evento de logro desbloqueado
          }
        }
      }
    }
  }

  // Actualizar estadísticas
  if (this.stats[type]) {
    this.stats[type] += value;
  }

  await this.save();
  return this;
};

const Mission = mongoose.model('Mission', missionSchema);
const Achievement = mongoose.model('Achievement', achievementSchema);
const UserProgress = mongoose.model('UserProgress', userProgressSchema);

module.exports = {
  Mission,
  Achievement,
  UserProgress
};