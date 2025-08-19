const express = require('express');
const router = express.Router();
const { 
  createCheckoutSession, 
  createPortalSession, 
  getSubscriptionStatus 
} = require('../controllers/billingController');
const { 
  validateCheckoutCreation, 
  validatePortalRequest 
} = require('../middleware/validation');
const { authenticateToken, requireRole } = require('../middleware/auth');

// POST /api/billing/checkout - Criar checkout session
router.post('/checkout', validateCheckoutCreation, createCheckoutSession);

// POST /api/billing/portal - Criar portal session
router.post('/portal', authenticateToken, requireRole(['admin']), validatePortalRequest, createPortalSession);

// GET /api/billing/status/:tenant_id - Buscar status da assinatura
router.get('/status/:tenant_id', authenticateToken, getSubscriptionStatus);

module.exports = router;

