const express = require('express');
const router = express.Router();
const sugestoesController = require('../controllers/sugestoesController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.post('/', authenticateToken, sugestoesController.createSugestao);
router.get('/', authenticateToken, requireRole(['moderator']), sugestoesController.listSugestoes);

module.exports = router;
