const express = require('express');
const router = express.Router();
const { getProfile, changePassword } = require('../controllers/profileController');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, getProfile);
router.put('/password', authenticateToken, changePassword);

module.exports = router;
