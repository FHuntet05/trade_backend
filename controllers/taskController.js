// RUTA: backend/controllers/taskController.js (NUEVO Y COMPLETO v21.22)

const User = require('../models/userModel');
const mongoose = require('mongoose');

// Tareas definidas en el servidor para validación
const TASKS_CONFIG = {
  joinedTelegram: { reward: 100 }, // Ejemplo de recompensa
  boughtUpgrade: { reward: 500 },
  invitedTenFriends: { reward: 1000 },
};

const getTaskStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('tasks referrals activeTools');
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }

    const isCompleted = {
      joinedTelegram: user.tasks.joinedTelegram.visited,
      boughtUpgrade: user.activeTools && user.activeTools.length > 0,
      invitedTenFriends: user.referrals && user.referrals.length >= 10,
    };

    const claimedTasks = {
      joinedTelegram: user.tasks.joinedTelegram.claimed,
      boughtUpgrade: user.tasks.boughtUpgrade.claimed,
      invitedTenFriends: user.tasks.invitedTenFriends.claimed,
    };

    res.json({ isCompleted, claimedTasks });
  } catch (error) {
    console.error("Error en getTaskStatus:", error);
    res.status(500).json({ message: 'Error del servidor al obtener el estado de las tareas.' });
  }
};


const claimTask = async (req, res) => {
  const { taskName } = req.body;
  if (!TASKS_CONFIG[taskName]) {
    return res.status(400).json({ message: 'Tarea no válida.' });
  }

  try {
    const user = await User.findById(req.user.id).populate('activeTools.tool');
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }

    // Lógica para verificar si la tarea está completada y no reclamada
    let canClaim = false;
    if (taskName === 'joinedTelegram' && user.tasks.joinedTelegram.visited && !user.tasks.joinedTelegram.claimed) {
      canClaim = true;
      user.tasks.joinedTelegram.claimed = true;
    } else if (taskName === 'boughtUpgrade' && user.activeTools.length > 0 && !user.tasks.boughtUpgrade.claimed) {
      canClaim = true;
      user.tasks.boughtUpgrade.claimed = true;
    } else if (taskName === 'invitedTenFriends' && user.referrals.length >= 10 && !user.tasks.invitedTenFriends.claimed) {
      canClaim = true;
      user.tasks.invitedTenFriends.claimed = true;
    }

    if (canClaim) {
      const reward = TASKS_CONFIG[taskName].reward;
      user.balance.ntx += reward;
      await user.save();
      // Devolvemos el usuario actualizado para que el frontend pueda refrescar el estado
      const updatedUser = await User.findById(req.user.id).populate('activeTools.tool');
      res.json({ message: `¡Has reclamado ${reward} NTX!`, user: updatedUser.toObject() });
    } else {
      res.status(400).json({ message: 'La tarea no está lista para ser reclamada o ya fue reclamada.' });
    }
  } catch (error) {
    console.error("Error en claimTask:", error);
    res.status(500).json({ message: 'Error del servidor.' });
  }
};

// === NUEVO CONTROLADOR CRÍTICO ===
// @desc    Marca una tarea como visitada por el usuario
// @route   POST /api/tasks/mark-as-visited
// @access  Private
export const markTaskAsVisited = asyncHandler(async (req, res) => {
    const { taskId } = req.body;
    
    // Solo permitimos esta lógica para tareas específicas
    if (taskId !== 'joinedTelegram') {
        res.status(400);
        throw new Error('ID de tarea no válido para esta acción.');
    }

    const user = await User.findById(req.user.id);

    if (!user) {
        res.status(404);
        throw new Error('Usuario no encontrado.');
    }
    
    // Usamos el método .set() de Mongoose Map para asegurar la detección de cambios.
    // Marcamos la tarea de Telegram como "visitada".
    user.tasks.set('telegramVisited', true);

    // Guardamos los cambios en la base de datos.
    await user.save();
    
    // Devolvemos el estado actualizado de las tareas para que el frontend
    // pueda re-renderizar inmediatamente sin necesidad de otra llamada a la API.
    const updatedTaskStatus = {
        claimedTasks: user.tasks.get('claimedTasks') || {},
        telegramVisited: user.tasks.get('telegramVisited') || false,
        referralCount: user.referrals ? user.referrals.length : 0,
        hasBoughtUpgrade: user.activeTools.length > 0,
    };

    res.status(200).json({
        message: 'Tarea marcada como visitada.',
        taskStatus: updatedTaskStatus,
    });
});

// Exporta todo junto
export { getTaskStatus, claimTaskReward, markTaskAsVisited };