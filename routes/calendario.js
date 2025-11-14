const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscription');
const calendarioController = require('../controllers/calendarioController');

const router = express.Router();

router.get('/', authenticateToken, requireActiveSubscription, calendarioController.getCalendario);

module.exports = router;
