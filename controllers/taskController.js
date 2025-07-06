// backend/controllers/taskController.js
const User = require('../models/userModel');
const { createTransaction } = require('../utils/transactionLogger');

const REWARDS = {
  BOUGHT_UPGRADE: 1500,
  INVITED_TEN_FRIENDS: 1000,
  JOINED_TELEGRAM: 500,
};

// @desc    Obtener el estado de las tareas del usuario
// @route   GET /api/tasks/status
const getTaskStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('claimedTasks');
    // Contamos cuántos referidos tiene el usuario para la tarea de invitar amigos
    const referralCount = await User.countDocuments({ referredBy: req.user.id });

    res.json({
      claimedTasks: user.claimedTasks,
      referralCount,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el estado de las tareas.' });
  }
};


// @desc    Reclamar la recompensa de una tarea
// @route   POST /api/tasks/claim
const claimTaskReward = async (req, res) => {
  const { taskName } = req.body; // ej: "boughtUpgrade", "invitedTenFriends", "joinedTelegram"
  const userId = req.user.id;

  if (!taskName || !Object.keys(REWARDS).some(key => key.toLowerCase().includes(taskName.toLowerCase())) ) {
    return res.status(400).json({ message: 'Nombre de tarea no válido.' });
  }

  try {
    const user = await User.findById(userId);

    // Verificación genérica de que la tarea no haya sido reclamada
    if (user.claimedTasks[taskName]) {
      return res.status(400).json({ message: 'Ya has reclamado esta recompensa.' });
    }

    let canClaim = false;
    let rewardAmount = 0;
    let description = '';

    // Lógica específica para cada tarea
    switch (taskName) {
      case 'boughtUpgrade':
        // Verificamos si el usuario tiene alguna herramienta activa
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
        // Esta tarea se valida del lado del cliente. Confiamos en que si se llama es porque el usuario hizo clic.
        canClaim = true;
        rewardAmount = REWARDS.JOINED_TELEGRAM;
        description = 'Recompensa por unirse al canal';
        break;
    }

    if (canClaim) {
      // Asignar recompensa, marcar como reclamada y registrar transacción
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
        // Este caso no debería ocurrir si las validaciones son correctas, pero es una salvaguarda.
        res.status(400).json({ message: 'No cumples los requisitos para esta tarea.' });
    }

  } catch (error) {
    console.error(`Error al reclamar la tarea ${taskName}:`, error);
    res.status(500).json({ message: 'Error del servidor.' });
  }
};

module.exports = { getTaskStatus, claimTaskReward };