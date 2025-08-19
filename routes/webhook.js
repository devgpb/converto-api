const express = require('express');
const router = express.Router();
const { handleStripeWebhook } = require('../controllers/webhookController');

// POST /api/stripe/webhook - Webhook do Stripe
// Importante: Este endpoint deve receber o raw body, não JSON parseado
router.post('/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

module.exports = router;

