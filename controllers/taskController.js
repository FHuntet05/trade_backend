// RUTA: backend/controllers/taskController.js (VERSIÓN "NEXUS - TASK LOGIC FIX")
const asyncHandler = require('express-async-handler');
const User = require('../models/userModel.js');
const Tool = require('../models/toolModel.js'); // Importamos Tool para la lógica de populate

/**
 * @desc Marca la tarea de Telegram como visitada y reclama la recompensa atómicamente.
 * @route POST /api/tasks/mark-as-visited
 * @access Private
 */
const markTaskAsVisited = asyncHandler(async (req, res) => {
    const { taskId } = req.body;
    if (taskId !== 'joinedTelegram') {
        res.status(400); throw new Error('ID de tarea no válido.');
    }

    const reward = 500;

    const updatedUser = await User.findOneAndUpdate(
        { _id: req.user.id, 'claimedTasks.joinedTelegram': { $ne: true } },
        {
            $set: { telegramVisited: true, 'claimedTasks.joinedTelegram': true },
            $inc: { 'balance.ntx': reward }
        },
        { new: true }
    ).populate('activeTools.tool referrals');

    if (!updatedUser) {
        res.status(400); throw new Error('Esta tarea ya ha sido completada.');
    }

    res.status(200).json({
        success: true,
        message: `¡+${reward} NTX reclamados!`,
        user: updatedUser.toObject()
    });
});


/**
 * @desc Reclama la recompensa para tareas que requieren un clic manual (ATÓMICO).
 * @route POST /api/tasks/claim
 * @access Private
 */
const claimTaskReward = asyncHandler(async (req, res) => {
    const { taskId } = req.body;
    const userId = req.user.id;

    // [NEXUS TASK LOGIC FIX] - Populamos las herramientas para la comprobación
    const user = await User.findById(userId).select('activeTools referrals').populate('activeTools.tool');
    if (!user) { res.status(404); throw new Error('Usuario no encontrado'); }

    const taskRewards = { boughtUpgrade: 1500, inviteFriends: 1000 };
    const reward = taskRewards[taskId];
    if (!reward) { res.status(400); throw new Error('Tarea no válida.'); }

    let isCompleted = false;
    switch (taskId) {
        case 'boughtUpgrade':
            // [NEXUS TASK LOGIC FIX] - La comprobación ahora es inteligente
            const purchasedToolsCount = user.activeTools.filter(t => t.tool && !t.tool.isFree).length;
            isCompleted = purchasedToolsCount > 0;
            break;
        case 'inviteFriends':
            isCompleted = user.referrals && user.referrals.length >= 10;
            break;
    }

    if (!isCompleted) { res.status(400); throw new Error('La tarea aún no está completada.'); }
    
    const updatedUser = await User.findOneAndUpdate(
        { _id: userId, [`claimedTasks.${taskId}`]: { $ne: true } },
        { $inc: { 'balance.ntx': reward }, $set: { [`claimedTasks.${taskId}`]: true } },
        { new: true }
    ).populate('activeTools.tool referrals');

    if (!updatedUser) {
        res.status(400);
        throw new Error('Ya has reclamado esta recompensa.');
    }

    res.json({ message: `¡+${reward.toLocaleString()} NTX reclamados!`, user: updatedUser.toObject() });
});


/**
 * @desc Obtiene el estado actual de todas las tareas para el usuario.
 * @route GET /api/tasks/status
 * @access Private
 */
const getTaskStatus = asyncHandler(async (req, res) => {
    // [NEXUS TASK LOGIC FIX] - La clave es popular 'activeTools.tool' para acceder a sus propiedades.
    const user = await User.findById(req.user.id)
        .select('claimedTasks telegramVisited activeTools referrals')
        .populate('activeTools.tool'); // <-- ¡LA CORRECCIÓN MÁS IMPORTANTE!

    if (!user) { res.status(404); throw new Error('Usuario no encontrado'); }

    const allTasks = [
        { taskId: 'boughtUpgrade', reward: 1500, target: 1 },
        { taskId: 'inviteFriends', reward: 1000, target: 10 },
        { taskId: 'joinedTelegram', reward: 500, target: 1, link: 'https://t.me/BlockSphere_Channel' }
    ];

    const userTaskStatus = allTasks.map(task => {
        const isClaimed = user.claimedTasks?.get(task.taskId) || false;
        let progress = 0;
        let status = 'in_progress';

        switch (task.taskId) {
            case 'boughtUpgrade':
                // [NEXUS TASK LOGIC FIX] - Ahora contamos solo las herramientas compradas (no gratuitas).
                const purchasedToolsCount = user.activeTools.filter(t => t.tool && !t.tool.isFree).length;
                progress = purchasedToolsCount > 0 ? 1 : 0;
                
                if (!isClaimed && progress >= task.target) status = 'claimable';
                else if (!isClaimed) status = 'action_required';
                break;
            case 'inviteFriends':
                progress = user.referrals ? user.referrals.length : 0;
                if (!isClaimed && progress >= task.target) status = 'claimable';
                else if (!isClaimed) status = 'action_required';
                break;
            case 'joinedTelegram':
                progress = user.telegramVisited ? 1 : 0;
                if (!isClaimed) status = 'action_required';
                break;
        }
        
        return { ...task, isClaimed, progress, status };
    });

    res.json(userTaskStatus);
});

module.exports = {
    getTaskStatus,
    claimTaskReward,
    markTaskAsVisited
};