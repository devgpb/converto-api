const express = require('express');
const router = express.Router();
const { getProfile, changePassword, forgotPassword, resetPassword } = require('../controllers/profileController');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, getProfile);
router.put('/password', authenticateToken, changePassword);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
