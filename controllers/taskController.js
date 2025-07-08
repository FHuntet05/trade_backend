// backend/controllers/taskController.js
const User = require('../models/userModel');
const { createTransaction } = require('../utils/transactionLogger');

const REWARDS = {
  BOUGHT_UPGRADE: 1500,
  INVITED_TEN_FRIENDS: 1000,
  JOINED_TELEGRAM: 500,
};

const getTaskStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('claimedTasks');
    const referralCount = await User.countDocuments({ referredBy: req.user.id });

    res.json({
      claimedTasks: user.claimedTasks,
      referralCount,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el estado de las tareas.' });
  }
};

const claimTaskReward = async (req, res) => {
  const { taskName } = req.body;
  const userId = req.user.id;

  if (!taskName || !Object.keys(REWARDS).some(key => key.toLowerCase().includes(taskName.toLowerCase())) ) {
    return res.status(400).json({ message: 'Nombre de tarea no válido.' });
  }

  try {
    const user = await User.findById(userId);

    if (user.claimedTasks[taskName]) {
      return res.status(400).json({ message: 'Ya has reclamado esta recompensa.' });
    }

    let canClaim = false;
    let rewardAmount = 0;
    let description = '';

    switch (taskName) {
      case 'boughtUpgrade':
        if (user.activeTools.length > 0) {
          canClaim = true;
          rewardAmount = REWARDS.BOUGHT_UPGRADE;
          description = 'Recompensa por primera mejora';
        } else {
          return res.status(400).json({ message: 'Debes comprar una mejora para reclamar esta recompensa.' });
        }
        break;
      case 'invitedTenFriends':
        const referralCount = await User.countDocuments({ referredBy: userId });
        if (referralCount >= 10) {
          canClaim = true;
          rewardAmount = REWARDS.INVITED_TEN_FRIENDS;
          description = 'Recompensa por invitar 10 amigos';
        } else {
          return res.status(400).json({ message: 'Aún no has invitado a 10 amigos.' });
        }
        break;
      case 'joinedTelegram':
        canClaim = true;
        rewardAmount = REWARDS.JOINED_TELEGRAM;
        description = 'Recompensa por unirse al canal';
        break;
    }

    if (canClaim) {
      user.balance.ntx += rewardAmount;
      user.claimedTasks[taskName] = true;
      await user.save();
      await createTransaction(userId, 'task_reward', rewardAmount, 'NTX', description);

      const updatedUser = await User.findById(userId).populate('activeTools.tool');
      res.json({
        message: `¡Has reclamado ${rewardAmount} NTX!`,
        user: updatedUser.toObject(),
      });
    } else {
        res.status(400).json({ message: 'No cumples los requisitos para esta tarea.' });
    }

  } catch (error) {
    console.error(`Error al reclamar la tarea ${taskName}:`, error);
    res.status(500).json({ message: 'Error del servidor.' });
  }
};

module.exports = { getTaskStatus, claimTaskReward };