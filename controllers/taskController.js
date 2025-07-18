// backend/controllers/taskController.js (CÓDIGO COMPLETO Y CORREGIDO)
const asyncHandler = require('express-async-handler');
const User = require('../models/userModel.js');

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

    // === INICIO DE LA CORRECCIÓN CRÍTICA DE PERSISTENCIA ===
    // Forzamos a Mongoose a reconocer que el campo 'tasks' ha sido modificado.
    // Esto garantiza que el cambio se escribirá en la base de datos.
    user.markModified('tasks');
    // === FIN DE LA CORRECCIÓN CRÍTICA DE PERSISTENCIA ===

    await user.save();
    res.status(200).json({
        success: true,
        message: 'Tarea marcada como visitada.',
    });
});

const claimTaskReward = asyncHandler(async (req, res) => {
    const { taskId } = req.body;
    const user = await User.findById(req.user.id).select('+tasks +balance');
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
    user.balance.ntx += reward;
    claimedTasks[taskId] = true;
    user.tasks.set('claimedTasks', claimedTasks);

    // === INICIO DE LA CORRECCIÓN CRÍTICA DE PERSISTENCIA ===
    // Forzamos a Mongoose a reconocer que el campo 'tasks' ha sido modificado.
    // Esto garantiza que el estado "reclamado" se escribirá en la base de datos.
    user.markModified('tasks');
    // === FIN DE LA CORRECCIÓN CRÍTICA DE PERSISTENCIA ===

    await user.save();
    const updatedUser = await User.findById(user._id).populate('referrals');
    res.json({ message: `¡+${reward.toLocaleString()} NTX reclamados!`, user: updatedUser });
});

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