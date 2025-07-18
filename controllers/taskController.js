// backend/controllers/taskController.js
const asyncHandler = require('express-async-handler');
const User = require('../models/userModel.js');

// @desc    Marca una tarea como visitada por el usuario
// @route   POST /api/tasks/mark-as-visited
// @access  Private
const markTaskAsVisited = asyncHandler(async (req, res) => {
    const { taskId } = req.body;
    
    if (taskId !== 'joinedTelegram') {
        res.status(400);
        throw new Error('ID de tarea no válido para esta acción.');
    }

    const user = await User.findById(req.user.id);

    if (!user) {
        res.status(404);
        throw new Error('Usuario no encontrado.');
    }
    
    if (!user.tasks) {
        user.tasks = new Map();
    }
    
    user.tasks.set('telegramVisited', true);
    await user.save();
    
    res.status(200).json({
        success: true,
        message: 'Tarea marcada como visitada.',
    });
});

// @desc    Reclama la recompensa de una tarea completada
// @route   POST /api/tasks/claim
// @access  Private
const claimTaskReward = asyncHandler(async (req, res) => {
    const { taskId } = req.body;
    const user = await User.findById(req.user.id).select('+tasks');

    if (!user) {
        res.status(404);
        throw new Error('Usuario no encontrado');
    }
    
    if (!user.tasks) user.tasks = new Map();

    const claimedTasks = user.tasks.get('claimedTasks') || {};

    if (claimedTasks[taskId]) {
        res.status(400);
        throw new Error('Ya has reclamado esta recompensa.');
    }

    const taskRewards = {
        boughtUpgrade: 1500,
        invitedTenFriends: 1000,
        joinedTelegram: 500,
    };
    
    const reward = taskRewards[taskId];
    if (!reward) {
        res.status(400);
        throw new Error('Tarea no válida.');
    }
    
    let isCompleted = false;
    switch (taskId) {
        case 'boughtUpgrade':
            isCompleted = user.activeTools && user.activeTools.length > 0;
            break;
        case 'invitedTenFriends':
            // Asegurarnos que user.referrals existe antes de acceder a length
            const referralCount = Array.isArray(user.referrals) ? user.referrals.length : 0;
            isCompleted = referralCount >= 3;
            break;
        case 'joinedTelegram':
            isCompleted = user.tasks.get('telegramVisited') === true;
            break;
        default:
            isCompleted = false;
    }

    if (!isCompleted) {
        res.status(400);
        throw new Error('La tarea aún no está completada.');
    }

    user.balance += reward;
    claimedTasks[taskId] = true;
    user.tasks.set('claimedTasks', claimedTasks);

    await user.save();
    
    // Devolvemos el usuario completo y actualizado para el store de Zustand
    const updatedUser = await User.findById(user._id).populate('referrals');
    res.json({ message: '¡Recompensa reclamada!', user: updatedUser });
});

// @desc    Obtiene el estado actual de las tareas del usuario
// @route   GET /api/tasks/status
// @access  Private
const getTaskStatus = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select('tasks activeTools referrals');

    if (!user) {
        res.status(404);
        throw new Error('Usuario no encontrado');
    }
    
    const tasks = user.tasks || new Map();
    const referralCount = Array.isArray(user.referrals) ? user.referrals.length : 0;
    const hasBoughtUpgrade = Array.isArray(user.activeTools) ? user.activeTools.length > 0 : false;

    res.json({
        claimedTasks: tasks.get('claimedTasks') || {},
        telegramVisited: tasks.get('telegramVisited') || false,
        referralCount: referralCount,
        hasBoughtUpgrade: hasBoughtUpgrade,
    });
});

module.exports = { 
    getTaskStatus, 
    claimTaskReward, 
    markTaskAsVisited 
};