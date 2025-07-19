const User = require('../models/User');

exports.syncUser = async (req, res) => {
  const { user, refCode } = req.body;

  if (!user || !refCode) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  try {
    const existingUser = await User.findOne({ telegramId: user.telegramId });

    if (existingUser) {
      // Actualizar datos del usuario existente
      existingUser.name = user.name;
      existingUser.username = user.username;
      await existingUser.save();
      return res.json({ token: existingUser.token, user: existingUser, settings: existingUser.settings });
    } else {
      // Crear nuevo usuario
      const newUser = new User({ telegramId: user.telegramId, name: user.name, username: user.username, refCode });
      await newUser.save();
      return res.json({ token: newUser.token, user: newUser, settings: newUser.settings });
    }
  } catch (error) {
    console.error('Error al sincronizar usuario:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};