const express = require('express');
const router = express.Router();
const { 
  createCheckoutSession, 
  createPortalSession, 
  getSubscriptionStatus,
  syncSubscription,
  cancelSubscription,
  resumeSubscription,
  reactivateSubscription,
} = require('../controllers/billingController');
const { 
  validateCheckoutCreation, 
  validatePortalRequest,
  validateReactivationRequest
} = require('../middleware/validation');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { listCancellationReasons } = require('../controllers/cancellationController');

// POST /api/billing/checkout - Criar checkout session
router.post('/checkout', validateCheckoutCreation, createCheckoutSession);

// POST /api/billing/portal - Criar portal session
router.post('/portal', authenticateToken, requireRole(['admin', 'moderator']), validatePortalRequest, createPortalSession);

// POST /api/billing/sync - Sincronizar assinatura manualmente com o Stripe
router.post('/sync', authenticateToken, requireRole(['admin', 'moderator']), validatePortalRequest, syncSubscription);

// GET /api/billing/status/:tenant_id - Buscar status da assinatura
router.get('/status/:tenant_id', authenticateToken, getSubscriptionStatus);

// POST /api/billing/cancel - Cancelar renovação automática ao fim do período
router.post('/cancel', authenticateToken, requireRole(['admin', 'moderator']), validatePortalRequest, cancelSubscription);

// POST /api/billing/resume - Reativar renovação automática
router.post('/resume', authenticateToken, requireRole(['admin', 'moderator']), validatePortalRequest, resumeSubscription);

// POST /api/billing/reactivate - Criar novo checkout para reativar assinatura cancelada
router.post('/reactivate', authenticateToken, requireRole(['admin', 'moderator']), validateReactivationRequest, reactivateSubscription);

// GET /api/billing/cancellations - Listar motivos de cancelamento do tenant
router.get('/cancellations', authenticateToken, requireRole(['admin', 'moderator']), listCancellationReasons);

module.exports = router;
