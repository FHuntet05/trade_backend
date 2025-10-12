const mongoose = require('mongoose');

const wheelSegmentSchema = new mongoose.Schema({
  icon: {
    type: String,
    required: true
  },
  text: {
    type: String,
    required: true
  },
  color: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['ntx', 'usdt', 'xp', 'spins', 'nft'],
    required: true
  },
  value: {
    type: Number,
    required: true
  },
  probability: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const wheelSpinSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  segment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WheelSegment',
    required: true
  },
  reward: {
    type: {
      type: String,
      enum: ['ntx', 'usdt', 'xp', 'spins', 'nft'],
      required: true
    },
    value: {
      type: Number,
      required: true
    }
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const wheelConfigSchema = new mongoose.Schema({
  spinsPerDay: {
    type: Number,
    default: 3
  },
  resetTime: {
    type: String, // Formato "HH:mm"
    default: "00:00"
  },
  minProbabilitySum: {
    type: Number,
    default: 100
  },
  isActive: {
    type: Boolean,
    default: true
  },
  segments: [wheelSegmentSchema]
}, {
  timestamps: true
});

// Middleware para validar la suma de probabilidades
wheelConfigSchema.pre('save', function(next) {
  const probabilitySum = this.segments.reduce((sum, segment) => {
    return sum + (segment.isActive ? segment.probability : 0);
  }, 0);

  if (Math.abs(probabilitySum - this.minProbabilitySum) > 0.01) {
    next(new Error(`La suma de probabilidades debe ser ${this.minProbabilitySum}%. Actual: ${probabilitySum}%`));
  }
  next();
});

// Métodos estáticos
wheelConfigSchema.statics.spinWheel = async function(userId) {
  const config = await this.findOne({ isActive: true });
  if (!config) throw new Error('No hay configuración de ruleta activa');

  const activeSegments = config.segments.filter(s => s.isActive);
  const random = Math.random() * 100;
  let accumulatedProbability = 0;
  let selectedSegment;

  for (const segment of activeSegments) {
    accumulatedProbability += segment.probability;
    if (random <= accumulatedProbability) {
      selectedSegment = segment;
      break;
    }
  }

  if (!selectedSegment) {
    selectedSegment = activeSegments[activeSegments.length - 1];
  }

  const spin = await WheelSpin.create({
    user: userId,
    segment: selectedSegment._id,
    reward: {
      type: selectedSegment.type,
      value: selectedSegment.value
    }
  });

  return spin;
};

const WheelConfig = mongoose.model('WheelConfig', wheelConfigSchema);
const WheelSpin = mongoose.model('WheelSpin', wheelSpinSchema);

module.exports = {
  WheelConfig,
  WheelSpin
};