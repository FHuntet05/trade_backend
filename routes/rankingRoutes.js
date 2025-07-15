const express = require('express');
const router = express.Router();
const { getRanking } = require('../controllers/rankingController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getRanking);

module.exports = router;