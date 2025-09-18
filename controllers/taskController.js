// RUTA: backend/controllers/taskController.js (VERSIÓN NEXUS - A PRUEBA DE RACE CONDITIONS)
const asyncHandler = require('express-async-handler');
const User = require('../models/userModel.js');

/**
 * @desc Marca la tarea de Telegram como visitada y reclama la recompensa atómicamente.
 * @route POST /api/tasks/mark-as-visited
 * @access Private
 *
 * SOLUCIÓN ATÓMICA: La versión anterior era vulnerable a condiciones de carrera.
 * Esta nueva versión utiliza una única operación `findByIdAndUpdate` con una consulta condicional.
 * La consulta busca al usuario SOLO SI la tarea `joinedTelegram` NO ha sido reclamada (`$ne: true`).
 * - Si la encuentra, actualiza el saldo y marca la tarea como reclamada en un solo paso.
 * - Si NO la encuentra (porque ya fue reclamada), devuelve `null` y la operación falla de forma segura.
 * Esto elimina por completo la posibilidad de reclamos múltiples.
 */
const markTaskAsVisited = asyncHandler(async (req, res) => {
    const { taskId } = req.body;
    if (taskId !== 'joinedTelegram') {
        res.status(400); throw new Error('ID de tarea no válido.');
    }

    const reward = 500;

    // --- LA CORRECCIÓN ATÓMICA ---
    const updatedUser = await User.findByIdAndUpdate(
        {
            _id: req.user.id,
            'claimedTasks.joinedTelegram': { $ne: true } // Condición: SOLO si no está ya reclamada
        },
        {
            $set: {
                telegramVisited: true,
                'claimedTasks.joinedTelegram': true
            },
            $inc: { 'balance.ntx': reward }
        },
        { new: true } // Devuelve el documento actualizado si la operación tuvo éxito
    );

    if (!updatedUser) {
        // Si updatedUser es null, significa que la condición no se cumplió (la tarea ya estaba reclamada).
        res.status(400);
        throw new Error('Esta tarea ya ha sido completada.');
    }

    res.status(200).json({
        success: true,
        message: `¡+${reward} NTX reclamados!`,
        user: updatedUser
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

    // Primero, validamos la lógica de negocio que no se puede hacer en la consulta atómica.
    const user = await User.findById(userId).select('activeTools referrals');
    if (!user) { res.status(404); throw new Error('Usuario no encontrado'); }

    const taskRewards = { boughtUpgrade: 1500, inviteFriends: 1000 };
    const reward = taskRewards[taskId];
    if (!reward) { res.status(400); throw new Error('Tarea no válida.'); }

    let isCompleted = false;
    switch (taskId) {
        case 'boughtUpgrade':
            isCompleted = user.activeTools && user.activeTools.length > 0;
            break;
        case 'inviteFriends':
            isCompleted = user.referrals && user.referrals.length >= 10;
            break;
    }

    if (!isCompleted) { res.status(400); throw new Error('La tarea aún no está completada.'); }
    
    // --- LA CORRECCIÓN ATÓMICA ---
    const updatedUser = await User.findByIdAndUpdate(
        { _id: userId, [`claimedTasks.${taskId}`]: { $ne: true } }, // Condición: SOLO si no está ya reclamada
        { $inc: { 'balance.ntx': reward }, $set: { [`claimedTasks.${taskId}`]: true } },
        { new: true }
    ).populate('referrals');

    if (!updatedUser) {
        res.status(400);
        throw new Error('Ya has reclamado esta recompensa.');
    }

    res.json({ message: `¡+${reward.toLocaleString()} NTX reclamados!`, user: updatedUser });
});


// getTaskStatus se mantiene igual, es correcto.
const getTaskStatus = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select('claimedTasks telegramVisited activeTools referrals');
    if (!user) { res.status(404); throw new Error('Usuario no encontrado'); }

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