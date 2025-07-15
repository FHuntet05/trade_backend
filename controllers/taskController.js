// backend/controllers/taskController.js (COMPLETO Y CORREGIDO)
const User = require('../models/userModel');
const { createTransaction } = require('../utils/transactionLogger');

const getTaskStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('claimedTasks referrals activeTools');
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });

    res.json({
      claimedTasks: user.claimedTasks,
      referralCount: user.referrals ? user.referrals.length : 0,
    });
  } catch (error) {
    console.error('Error en getTaskStatus:', error);
    res.status(500).json({ message: 'Error del servidor.' });
  }
};

const markTaskAsVisited = async (req, res) => {
    const { taskName } = req.body;
    if (taskName !== 'joinedTelegram') {
        return res.status(400).json({ message: 'Nombre de tarea no válido.' });
    }
    try {
        await User.updateOne({ _id: req.user.id }, { $set: { "claimedTasks.joinedTelegramAttempt": true } });
        res.status(200).json({ message: 'Tarea marcada como visitada.' });
    } catch (error) {
        console.error('Error en markTaskAsVisited:', error);
        res.status(500).json({ message: 'Error del servidor.' });
    }
};

const claimTaskReward = async (req, res) => {
    const { taskName } = req.body;
    const userId = req.user.id;

    if (!taskName) return res.status(400).json({ message: 'El nombre de la tarea es requerido.' });

    const tasks = {
        boughtUpgrade: { reward: 1500, description: "Recompensa por primera mejora" },
        invitedTenFriends: { reward: 1000, description: "Recompensa por 3 referidos" }, // Descripción actualizada
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
            case 'boughtUpgrade': 
                isCompleted = user.activeTools && user.activeTools.length > 0; 
                break;
            case 'invitedTenFriends': 
                isCompleted = user.referrals && user.referrals.length >= 3; // <-- REQUISITO CORREGIDO
                break;
            case 'joinedTelegram': 
                isCompleted = user.claimedTasks.joinedTelegramAttempt === true; 
                break;
            default: 
                return res.status(400).json({ message: 'Lógica de tarea no implementada.' });
        }

        if (!isCompleted) return res.status(400).json({ message: 'Aún no has completado esta tarea.' });

        user.balance.ntx += task.reward;
        user.claimedTasks[taskName] = true;
        user.markModified('claimedTasks');
        
        await createTransaction(userId, 'task_reward', task.reward, 'NTX', task.description);
        await user.save();
        
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
  markTaskAsVisited,
  claimTaskReward
};