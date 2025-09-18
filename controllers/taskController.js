// RUTA: backend/controllers/taskController.js (VERSIÓN NEXUS - FORMATO DE DATOS CORREGIDO)
const asyncHandler = require('express-async-handler');
const User = require('../models/userModel.js');

// Los otros controladores (markTaskAsVisited, claimTaskReward) son robustos y no necesitan cambios.
// ... (código de markTaskAsVisited sin cambios)
const markTaskAsVisited = asyncHandler(async (req, res) => {
    const { taskId } = req.body;
    if (taskId !== 'joinedTelegram') {
        res.status(400);
        throw new Error('ID de tarea no válido para esta acción.');
    }
    await User.findByIdAndUpdate(req.user.id, { $set: { telegramVisited: true } });
    res.status(200).json({ success: true, message: 'Tarea marcada como visitada.' });
});

// ... (código de claimTaskReward sin cambios)
const claimTaskReward = asyncHandler(async (req, res) => {
    const { taskId } = req.body;
    const userId = req.user.id;
    const user = await User.findById(userId).select('claimedTasks telegramVisited activeTools referrals balance');
    if (!user) { res.status(404); throw new Error('Usuario no encontrado'); }
    if (user.claimedTasks && user.claimedTasks[taskId]) { res.status(400); throw new Error('Ya has reclamado esta recompensa.'); }
    
    const taskRewards = { invitedTenFriends: 1000, joinedTelegram: 500 }; // Agregué invitedTenFriends que faltaba
    const reward = taskRewards[taskId];
    if (!reward) { res.status(400); throw new Error('Tarea no válida.'); }

    let isCompleted = false;
    switch (taskId) {
        case 'invitedTenFriends':
            isCompleted = user.referrals && user.referrals.length >= 5; // Objetivo de 5 según el frontend
            break;
        case 'joinedTelegram':
            isCompleted = user.telegramVisited === true;
            break;
        default: isCompleted = false;
    }

    if (!isCompleted) { res.status(400); throw new Error('La tarea aún no está completada.'); }

    const updatedUser = await User.findByIdAndUpdate(userId,
        { $inc: { 'balance.ntx': reward }, $set: { [`claimedTasks.${taskId}`]: true } },
        { new: true }
    ).populate('referrals');

    res.json({ message: `¡+${reward.toLocaleString()} NTX reclamados!`, user: updatedUser });
});


/**
 * @desc Obtiene el estado actual de TODAS las tareas para el usuario.
 * @route GET /api/tasks/status
 * @access Private
 *
 * JUSTIFICACIÓN DE LA RECONSTRUCCIÓN: La versión anterior devolvía un objeto plano
 * con estado agregado, pero el frontend espera un ARRAY de objetos, donde cada
 * objeto es una tarea autocontenida.
 *
 * SOLUCIÓN NEXUS:
 * 1.  Define una lista maestra de todas las tareas disponibles en el sistema.
 * 2.  Obtiene los datos relevantes del usuario de la base de datos.
 * 3.  Itera sobre la lista maestra y, para cada tarea, construye un objeto
 *     detallado con su estado específico para ESE usuario (progreso, si es reclamable, etc.).
 * 4.  Devuelve el ARRAY de objetos de tarea resultante, cumpliendo el contrato de la API
 *     que el frontend espera.
 */
const getTaskStatus = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select('claimedTasks telegramVisited referrals');
    if (!user) {
        res.status(404);
        throw new Error('Usuario no encontrado');
    }

    // --- 1. Lista Maestra de Tareas ---
    // Esta es la "fuente de verdad" de todas las tareas posibles en la aplicación.
    const allTasks = [
        {
            taskId: 'joinedTelegram',
            reward: 500,
            target: 1,
            link: 'https://t.me/BlockSphere_Channel' // Añadir el link aquí
        },
        {
            taskId: 'inviteFriends',
            reward: 1000,
            target: 5 // El frontend espera 5
        }
    ];

    // --- 2. Construir la Respuesta en el Formato Correcto ---
    const userTaskStatus = allTasks.map(task => {
        const isClaimed = user.claimedTasks?.[task.taskId] || false;
        let progress = 0;
        let status = 'in_progress'; // Estado por defecto

        // Lógica específica para cada tarea
        if (task.taskId === 'joinedTelegram') {
            progress = user.telegramVisited ? 1 : 0;
        }
        if (task.taskId === 'inviteFriends') {
            progress = user.referrals ? user.referrals.length : 0;
        }

        // Determinar el estado final de la tarea
        if (!isClaimed) {
            if (progress >= task.target) {
                status = 'claimable';
            } else if (task.taskId === 'joinedTelegram' && !user.telegramVisited) {
                status = 'action_required'; // Necesita hacer clic en 'Ir'
            }
        }
        
        return {
            ...task,
            isClaimed,
            progress,
            status
        };
    });

    res.json(userTaskStatus); // Devuelve el ARRAY de tareas
});

module.exports = {
    getTaskStatus,
    claimTaskReward,
    markTaskAsVisited
};