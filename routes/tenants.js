const express = require('express');
const router = express.Router();
const { createTenant, getTenant, updateTenant } = require('../controllers/tenantController');
const { validateTenantCreation } = require('../middleware/validation');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscription');


// POST /api/tenants - Criar novo tenant
router.post('/', validateTenantCreation, createTenant);

// GET /api/tenants/:id - Buscar tenant por ID
router.get('/:id', authenticateToken, getTenant);

// PUT /api/tenants/:id - Atualizar tenant
router.put('/:id', authenticateToken, requireRole(['admin', 'moderator']), updateTenant);

module.exports = router;

