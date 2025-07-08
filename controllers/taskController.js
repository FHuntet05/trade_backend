// backend/controllers/taskController.js (VERSIÓN CORREGIDA FINAL)
const User = require('../models/userModel');
const { createTransaction } = require('../utils/transactionLogger');

// Lógica de estado de las tareas para el frontend
const getTaskStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });

    // <<< CORRECCIÓN: Se envía la estructura de datos que el frontend espera >>>
    res.json({
      claimedTasks: user.claimedTasks,
      referralCount: user.referrals ? user.referrals.length : 0,
      canClaim: {
        boughtUpgrade: user.activeTools && user.activeTools.length > 0,
        invitedTenFriends: user.referrals && user.referrals.length >= 10,
        joinedTelegram: true, // Esta tarea siempre es "reclamable" si no se ha reclamado ya
      }
    });
  } catch (error) {
    console.error('Error en getTaskStatus:', error);
    res.status(500).json({ message: 'Error del servidor.' });
  }
};

// ... (El código de claimTaskReward que ya te proporcioné se mantiene igual)
const claimTaskReward = async (req, res) => {
    // ... (El código anterior es correcto y no necesita cambios)
    const { taskName } = req.body;
    const userId = req.user.id;

    if (!taskName) return res.status(400).json({ message: 'El nombre de la tarea es requerido.' });

    const tasks = {
        boughtUpgrade: { reward: 1500, description: "Recompensa por primera mejora" },
        invitedTenFriends: { reward: 1000, description: "Recompensa por 10 referidos" },
        joinedTelegram: { reward: 500, description: "Recompensa por unirse al canal" }
    };
    const task = tasks[taskName];

    if (!task) return res.status(400).json({ message: 'El nombre de la tarea no es válido.' });

    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
        if (user.claimedTasks[taskName] === true) return res.status(400).json({ message: 'Ya has reclamado esta recompensa.' });

        let isCompleted = false;
        switch (taskName) {
            case 'boughtUpgrade': isCompleted = user.activeTools && user.activeTools.length > 0; break;
            case 'invitedTenFriends': isCompleted = user.referrals && user.referrals.length >= 10; break;
            case 'joinedTelegram': isCompleted = true; break;
            default: return res.status(400).json({ message: 'Lógica de tarea no implementada.' });
        }

        if (!isCompleted) return res.status(400).json({ message: 'Aún no has completado esta tarea.' });

        user.balance.ntx += task.reward;
        user.claimedTasks[taskName] = true;
        user.markModified('claimedTasks');
        await user.save();
        
        await createTransaction(userId, 'task_reward', task.reward, 'NTX', task.description);
        
        const updatedUser = await User.findById(userId).populate('activeTools.tool');
        res.status(200).json({
            message: `¡Has reclamado ${task.reward} NTX!`,
            user: updatedUser.toObject(),
        });
    } catch (error) {
        console.error(`Error en claimTaskReward para la tarea ${taskName}:`, error);
        res.status(500).json({ message: 'Error del servidor al reclamar la tarea.' });
    }
};

module.exports = {
  getTaskStatus,
  claimTaskReward
};