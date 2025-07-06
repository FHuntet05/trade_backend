// backend/routes/rankingRoutes.js
const express = require('express');
const router = express.Router();
const { getRanking } = require('../controllers/rankingController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', getRanking); // El tipo se pasará como ?type=...

module.exports = router;