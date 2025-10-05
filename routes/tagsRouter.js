const express = require('express');
const router = express.Router();
const TagsController = require('../controllers/tagsController');
const { authenticateToken } = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscription');

router.post('/', authenticateToken, requireActiveSubscription, TagsController.create);
router.get('/', authenticateToken, requireActiveSubscription, TagsController.list);
router.get('/:id', authenticateToken, requireActiveSubscription, TagsController.get);
router.put('/:id', authenticateToken, requireActiveSubscription, TagsController.update);
router.delete('/:id', authenticateToken, requireActiveSubscription, TagsController.remove);

module.exports = router;

