const { Tenant, Subscription } = require('../models');
const stripe = require('../utils/stripe');
const { v4: uuidv4 } = require('uuid');

/**
 * Cria uma sessão de checkout no Stripe para iniciar uma assinatura.
 * Gera chave de idempotência e configura metadados do tenant.
 */
const createCheckoutSession = async (req, res) => {
  try {
    const { tenant_id, price_id, seatCountInicial, success_url, cancel_url } = req.body;

    // Verificar se o tenant existe
    const tenant = await Tenant.findByPk(tenant_id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    if (!tenant.stripe_customer_id) {
      return res.status(400).json({ error: 'Tenant não possui customer_id do Stripe' });
    }

    // Gerar chave de idempotência
    const idempotencyKey = uuidv4();

    // Criar checkout session no Stripe
    const session = await stripe.checkout.sessions.create({
      customer: tenant.stripe_customer_id,
      payment_method_types: ['card'],
      line_items: [{
        price: price_id,
        quantity: seatCountInicial,
      }],
      mode: 'subscription',
      success_url: success_url,
      cancel_url: cancel_url,
      subscription_data: {
        metadata: {
          tenant_id: tenant_id
        }
      },
      metadata: {
        tenant_id: tenant_id,
        initial_seat_count: seatCountInicial.toString()
      }
    }, {
      idempotencyKey: idempotencyKey
    });

    res.status(201).json({
      checkout_url: session.url,
      session_id: session.id
    });

  } catch (error) {
    console.error('Erro ao criar checkout session:', error);
    
    if (error.type === 'StripeError') {
      return res.status(400).json({ 
        error: 'Erro ao criar checkout session no Stripe',
        details: error.message 
      });
    }

    res.status(500).json({ 
      error: 'Erro interno do servidor ao criar checkout session' 
    });
  }
};

/**
 * Cria uma sessão do portal de cobrança do Stripe para o cliente.
 * Permite que o tenant gerencie dados de pagamento e faturas.
 */
const createPortalSession = async (req, res) => {
  try {
    const { tenant_id } = req.body;

    // Verificar se o tenant existe
    const tenant = await Tenant.findByPk(tenant_id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    if (!tenant.stripe_customer_id) {
      return res.status(400).json({ error: 'Tenant não possui customer_id do Stripe' });
    }

    // Criar portal session no Stripe
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: req.body.return_url || `${req.protocol}://${req.get('host')}/dashboard`,
    });

    res.json({
      portal_url: portalSession.url
    });

  } catch (error) {
    console.error('Erro ao criar portal session:', error);
    
    if (error.type === 'StripeError') {
      return res.status(400).json({ 
        error: 'Erro ao criar portal session no Stripe',
        details: error.message 
      });
    }

    res.status(500).json({ 
      error: 'Erro interno do servidor ao criar portal session' 
    });
  }
};

/**
 * Recupera o status de assinatura atual do tenant informado.
 */
const getSubscriptionStatus = async (req, res) => {
  try {
    const { tenant_id } = req.params;

    const tenant = await Tenant.findByPk(tenant_id, {
      include: [{
        model: Subscription,
        as: 'subscriptions',
        where: { status: ['active', 'trialing'] },
        required: false
      }]
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    res.json({
      tenant_id: tenant.id,
      status_billing: tenant.status_billing,
      subscriptions: tenant.subscriptions
    });

  } catch (error) {
    console.error('Erro ao buscar status da assinatura:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor ao buscar status da assinatura' 
    });
  }
};

module.exports = {
  createCheckoutSession,
  createPortalSession,
  getSubscriptionStatus
};

