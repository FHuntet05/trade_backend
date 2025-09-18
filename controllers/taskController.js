// RUTA: backend/controllers/taskController.js (VERSIÓN NEXUS - LÓGICA DE AUTO-RECLAMO)
const asyncHandler = require('express-async-handler');
const User = require('../models/userModel.js');

/**
 * @desc Marca la tarea de Telegram como visitada Y RECLAMA LA RECOMPENSA AUTOMÁTICAMENTE.
 * @route POST /api/tasks/mark-as-visited
 * @access Private
 *
 * RECONSTRUCCIÓN LÓGICA: Esta función ahora es una operación atómica de "visitar y auto-reclamar".
 * 1. Valida que la tarea no haya sido reclamada previamente.
 * 2. En una única operación a la base de datos ($set y $inc), marca la tarea como visitada,
 *    la marca como reclamada, y acredita la recompensa al saldo del usuario.
 * 3. Devuelve el usuario actualizado para que el frontend refleje el nuevo saldo al instante.
 */
const markTaskAsVisited = asyncHandler(async (req, res) => {
    const { taskId } = req.body;
    if (taskId !== 'joinedTelegram') {
        res.status(400);
        throw new Error('ID de tarea no válido para esta acción.');
    }

    const user = await User.findById(req.user.id).select('claimedTasks');
    if (user.claimedTasks && user.claimedTasks.joinedTelegram) {
        res.status(400);
        throw new Error('Ya has completado esta tarea.');
    }

    const reward = 500; // Recompensa fija para esta tarea

    const updatedUser = await User.findByIdAndUpdate(req.user.id, {
        $set: {
            telegramVisited: true,
            'claimedTasks.joinedTelegram': true
        },
        $inc: { 'balance.ntx': reward }
    }, { new: true });

    res.status(200).json({
        success: true,
        message: `¡+${reward} NTX reclamados!`,
        user: updatedUser
    });
});

/**
 * @desc Reclama la recompensa para tareas que requieren un clic manual (NO auto-reclamadas).
 * @route POST /api/tasks/claim
 * @access Private
 */
const claimTaskReward = asyncHandler(async (req, res) => {
    const { taskId } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId).select('claimedTasks activeTools referrals balance');
    if (!user) { res.status(404); throw new Error('Usuario no encontrado'); }
    if (user.claimedTasks && user.claimedTasks[taskId]) { res.status(400); throw new Error('Ya has reclamado esta recompensa.'); }

    const taskRewards = {
        boughtUpgrade: 1500,
        inviteFriends: 1000,
    };
    const reward = taskRewards[taskId];
    if (!reward) { res.status(400); throw new Error('Tarea no válida o es de auto-reclamo.'); }

    let isCompleted = false;
    switch (taskId) {
        case 'boughtUpgrade':
            isCompleted = user.activeTools && user.activeTools.length > 0;
            break;
        case 'inviteFriends':
            isCompleted = user.referrals && user.referrals.length >= 10; // Objetivo actualizado a 10
            break;
    }

    if (!isCompleted) { res.status(400); throw new Error('La tarea aún no está completada.'); }

    const updatedUser = await User.findByIdAndUpdate(userId,
        { $inc: { 'balance.ntx': reward }, $set: { [`claimedTasks.${taskId}`]: true } },
        { new: true }
    ).populate('referrals');

    res.json({ message: `¡+${reward.toLocaleString()} NTX reclamados!`, user: updatedUser });
});

/**
 * @desc Obtiene el estado de las tareas, ahora alineado con el nuevo diseño y lógica.
 * @route GET /api/tasks/status
 * @access Private
 */
const getTaskStatus = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select('claimedTasks telegramVisited activeTools referrals');
    if (!user) { res.status(404); throw new Error('Usuario no encontrado'); }

    // --- Lista Maestra de Tareas (Fuente de Verdad) ---
    const allTasks = [
        { taskId: 'boughtUpgrade', reward: 1500, target: 1 },
        { taskId: 'inviteFriends', reward: 1000, target: 10 },
        { taskId: 'joinedTelegram', reward: 500, target: 1, link: 'https://t.me/BlockSphere_Channel' }
    ];

    const userTaskStatus = allTasks.map(task => {
        const isClaimed = user.claimedTasks?.[task.taskId] || false;
        let progress = 0;
        let status = 'in_progress';

        switch (task.taskId) {
            case 'boughtUpgrade':
                progress = user.activeTools && user.activeTools.length > 0 ? 1 : 0;
                if (!isClaimed && progress >= task.target) status = 'claimable';
                else if (!isClaimed) status = 'action_required'; // Requiere ir a la tienda
                break;
            case 'inviteFriends':
                progress = user.referrals ? user.referrals.length : 0;
                if (!isClaimed && progress >= task.target) status = 'claimable';
                else if (!isClaimed) status = 'action_required'; // Requiere ir a la página de equipo
                break;
            case 'joinedTelegram':
                progress = user.telegramVisited ? 1 : 0;
                // Esta tarea se auto-reclama, por lo que nunca estará en estado 'claimable'.
                // Si no está reclamada, siempre es 'action_required'.
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