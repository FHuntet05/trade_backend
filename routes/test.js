// backend/routes/test.js
const express = require('express');
const router = express.Router();
router.get('/', (req, res) => res.send('Ruta de prueba OK'));
module.exports = router;