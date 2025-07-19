// backend/controllers/referralController.js (NUEVO ARCHIVO)
const User = require('../models/userModel');

const processReferral = async (req, res) => {
    // El ID del nuevo usuario viene del token (middleware 'protect')
    const newUserId = req.user.id;
    const { refCode } = req.body;

    if (!refCode) {
        return res.status(400).json({ message: 'Código de referido no proporcionado.' });
    }

    try {
        const [referrer, newUser] = await Promise.all([
            User.findOne({ telegramId: refCode }),
            User.findById(newUserId)
        ]);

        if (!referrer) {
            console.warn(`[Referral Process] Referente con ID ${refCode} no encontrado.`);
            // Devolvemos el usuario sin cambios, no es un error fatal.
            return res.status(200).json(newUser);
        }

        // Evitar que un usuario se refiera a sí mismo o que se procese dos veces.
        if (newUser.telegramId === referrer.telegramId || newUser.referredBy) {
             console.log(`[Referral Process] El usuario ${newUser.username} ya tiene un referente o es un auto-referido.`);
             return res.status(200).json(newUser);
        }
        
        // VINCULACIÓN
        newUser.referredBy = referrer._id;
        referrer.referrals.push({ level: 1, user: newUser._id });

        await Promise.all([
            newUser.save(),
            referrer.save()
        ]);
        
        console.log(`[Referral Process] ÉXITO: Usuario ${newUser.username} vinculado a referente ${referrer.username}.`);

        // Devolvemos el usuario actualizado y poblado
        const updatedUser = await User.findById(newUserId)
            .populate('activeTools.tool')
            .populate('referredBy', 'username fullName');

        res.status(200).json(updatedUser);

    } catch (error) {
        console.error('Error catastrófico en processReferral:', error);
        res.status(500).json({ message: 'Error interno al procesar el referido.' });
    }
};

module.exports = { processReferral };