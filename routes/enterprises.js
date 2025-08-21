const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  createEnterprise,
  listEnterprises,
  getEnterprise,
  updateEnterprise,
  deleteEnterprise,
} = require('../controllers/enterpriseController');

router.post('/', authenticateToken, createEnterprise);
router.get('/', authenticateToken, listEnterprises);
router.get('/:id', authenticateToken, getEnterprise);
router.put('/:id', authenticateToken, updateEnterprise);
router.delete('/:id', authenticateToken, deleteEnterprise);

module.exports = router;
