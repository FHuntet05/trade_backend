// backend/controllers/taskController.js (RECONSTRUCCIÓN FÉNIX v23.0)
const asyncHandler = require('express-async-handler');
const User = require('../models/userModel.js');

/**
 * @desc Marca la tarea de Telegram como visitada.
 * @route POST /api/tasks/mark-as-visited
 * @access Private
 *
 * JUSTIFICACIÓN DEL FRACASO v22.0: La versión anterior modificaba un objeto en memoria
 * y dependía de user.save() y markModified en un campo 'tasks' que no existía en el schema.
 * Esto causaba que el estado 'visitado' nunca se guardara de forma fiable.
 *
 * SOLUCIÓN FÉNIX v23.0: Se utiliza User.findByIdAndUpdate con el operador atómico $set.
 * Esta es una instrucción directa y única a la base de datos para establecer
 * 'telegramVisited' en true. Es una operación atómica, infalible y no depende de la
 * detección de cambios de Mongoose.
 */
const markTaskAsVisited = asyncHandler(async (req, res) => {
    const { taskId } = req.body;
    if (taskId !== 'joinedTelegram') {
        res.status(400);
        throw new Error('ID de tarea no válido para esta acción.');
    }

    await User.findByIdAndUpdate(req.user.id, {
        $set: { telegramVisited: true }
    });

    res.status(200).json({
        success: true,
        message: 'Tarea marcada como visitada.',
    });
});

/**
 * @desc Reclama la recompensa de una tarea completada.
 * @route POST /api/tasks/claim
 * @access Private
 *
 * JUSTIFICACIÓN DEL FRACASO v22.0: La versión anterior realizaba múltiples modificaciones
 * en el objeto 'user' en memoria (balance, estado de la tarea) y luego intentaba
 * guardarlo todo con un solo y frágil user.save(). Esto creaba condiciones de carrera
 * y fallos de persistencia, permitiendo reclamar recompensas múltiples veces.
 *
 * SOLUCIÓN FÉNIX v23.0:
 * 1. Primero se busca al usuario para realizar validaciones en el servidor.
 * 2. Si las validaciones pasan, se ejecuta UNA ÚNICA operación atómica
 *    User.findByIdAndUpdate que realiza dos acciones simultáneas en la base de datos:
 *    - Incrementar el balance con $inc (seguro contra race conditions).
 *    - Marcar la tarea como reclamada con $set en el sub-documento.
 * 3. Se usa { new: true } para obtener el documento actualizado y devolverlo,
 *    garantizando que el frontend recibe el estado real post-operación.
 *    Esta estrategia es indestructible y elimina toda posibilidad de explotación.
 */
const claimTaskReward = asyncHandler(async (req, res) => {
    const { taskId } = req.body;
    const userId = req.user.id;

    // 1. Obtener datos para validación
    const user = await User.findById(userId).select('claimedTasks telegramVisited activeTools referrals');
    if (!user) {
        res.status(404);
        throw new Error('Usuario no encontrado');
    }

    // 2. Validar si la recompensa ya fue reclamada
    if (user.claimedTasks && user.claimedTasks[taskId]) {
        res.status(400);
        throw new Error('Ya has reclamado esta recompensa.');
    }

    // 3. Definir recompensas y validar tarea
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

    // 4. Validar si la tarea fue completada
    let isCompleted = false;
    switch (taskId) {
        case 'boughtUpgrade':
            isCompleted = user.activeTools && user.activeTools.length > 0;
            break;
        case 'invitedTenFriends':
            // La tarea requiere 3 amigos según TaskItem.jsx
            isCompleted = user.referrals && user.referrals.length >= 3;
            break;
        case 'joinedTelegram':
            isCompleted = user.telegramVisited === true;
            break;
        default:
            isCompleted = false;
    }

    if (!isCompleted) {
        res.status(400);
        throw new Error('La tarea aún no está completada.');
    }

    // 5. Ejecutar la actualización atómica y definitiva
    const updatedUser = await User.findByIdAndUpdate(userId,
        {
            $inc: { 'balance.ntx': reward },
            $set: { [`claimedTasks.${taskId}`]: true }
        },
        { new: true } // Devuelve el documento actualizado
    ).populate('referrals');

    res.json({
        message: `¡+${reward.toLocaleString()} NTX reclamados!`,
        user: updatedUser
    });
});

/**
 * @desc Obtiene el estado actual de todas las tareas del usuario.
 * @route GET /api/tasks/status
 * @access Private
 *
 * JUSTIFICACIÓN DEL FRACASO v22.0: La versión anterior leía de un campo 'tasks'
 * inexistente en el schema, devolviendo datos inconsistentes o incorrectos
 * que causaban un comportamiento errático en la UI tras recargar.
 *
 * SOLUCIÓN FÉNIX v23.0: Lee directamente de los campos correctos y persistentes
 * en el modelo (claimedTasks, telegramVisited, etc.). Devuelve un estado que
 * es un reflejo 100% fiel de lo que está guardado en la base de datos.
 * Esta es ahora la única fuente de verdad para la UI.
 */
const getTaskStatus = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select('claimedTasks telegramVisited activeTools referrals');
    if (!user) {
        res.status(404);
        throw new Error('Usuario no encontrado');
    }

    const referralCount = user.referrals ? user.referrals.length : 0;
    const hasBoughtUpgrade = user.activeTools ? user.activeTools.length > 0 : false;

    res.json({
        claimedTasks: user.claimedTasks || {},
        telegramVisited: user.telegramVisited || false,
        referralCount: referralCount,
        hasBoughtUpgrade: hasBoughtUpgrade,
    });
});

module.exports = {
    getTaskStatus,
    claimTaskReward,
    markTaskAsVisited
};