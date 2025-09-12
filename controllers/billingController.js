const { Tenant, Subscription, CancellationReason } = require('../models');
const { Op } = require('sequelize');
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
        where: { status: { [Op.in]: ['active', 'trialing'] } },
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
  getSubscriptionStatus,
  /**
   * Cancela a renovação automática (cancel_at_period_end = true)
   * Apenas Admin/Moderator (validado na rota). Requer tenant_id no body.
   */
  cancelSubscription: async (req, res) => {
    try {
      const { tenant_id, motivo, descricao } = req.body;

      // Segurança básica: garantir que o usuário pertence ao tenant
      if (!req.tenant || req.tenant.id !== tenant_id) {
        return res.status(403).json({ error: 'Tenant inválido para este usuário' });
      }

      const tenant = await Tenant.findByPk(tenant_id);
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant não encontrado' });
      }
      if (!tenant.stripe_customer_id) {
        return res.status(400).json({ error: 'Tenant não possui customer_id do Stripe' });
      }

      // Buscar assinatura ativa/trial deste tenant
      const active = await Subscription.findOne({
        where: { tenant_id, status: { [Op.in]: ['active', 'trialing'] } },
        order: [['created_at', 'DESC']]
      });

      if (!active) {
        return res.status(404).json({ error: 'Nenhuma assinatura ativa encontrada' });
      }

      // Cancelar ao fim do período
      const updated = await stripe.subscriptions.update(active.stripe_subscription_id, {
        cancel_at_period_end: true,
      });

      // Registrar motivo opcional do cancelamento
      try {
        if (motivo || descricao) {
          await CancellationReason.create({
            tenant_id,
            stripe_subscription_id: active.stripe_subscription_id,
            motivo: typeof motivo === 'string' ? motivo : null,
            descricao: typeof descricao === 'string' ? descricao : null,
          });
        }
      } catch (logErr) {
        // Não falha o fluxo de cancelamento se o log não persistir
        console.error('Falha ao registrar motivo de cancelamento:', logErr);
      }

      // Responder com dados essenciais; sincronização completa via webhook
      return res.json({
        message: 'Renovação cancelada ao final do período vigente',
        cancel_at_period_end: updated.cancel_at_period_end === true,
        current_period_end: updated.current_period_end ? new Date(updated.current_period_end * 1000) : null,
        subscription_status: updated.status,
      });
    } catch (error) {
      console.error('Erro ao cancelar renovação da assinatura:', error);
      if (error.type === 'StripeError') {
        return res.status(400).json({ error: 'Erro no Stripe', details: error.message });
      }
      return res.status(500).json({ error: 'Erro interno ao cancelar renovação' });
    }
  },
  /**
   * Reverte o cancelamento (cancel_at_period_end = false)
   */
  resumeSubscription: async (req, res) => {
    try {
      const { tenant_id } = req.body;

      if (!req.tenant || req.tenant.id !== tenant_id) {
        return res.status(403).json({ error: 'Tenant inválido para este usuário' });
      }

      const tenant = await Tenant.findByPk(tenant_id);
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant não encontrado' });
      }
      if (!tenant.stripe_customer_id) {
        return res.status(400).json({ error: 'Tenant não possui customer_id do Stripe' });
      }

      const active = await Subscription.findOne({
        where: { tenant_id, status: { [Op.in]: ['active', 'trialing'] } },
        order: [['created_at', 'DESC']]
      });

      if (!active) {
        return res.status(404).json({ error: 'Nenhuma assinatura ativa encontrada' });
      }

      const updated = await stripe.subscriptions.update(active.stripe_subscription_id, {
        cancel_at_period_end: false,
      });

      return res.json({
        message: 'Renovação reativada',
        cancel_at_period_end: updated.cancel_at_period_end === true,
        current_period_end: updated.current_period_end ? new Date(updated.current_period_end * 1000) : null,
        subscription_status: updated.status,
      });
    } catch (error) {
      console.error('Erro ao reativar renovação da assinatura:', error);
      if (error.type === 'StripeError') {
        return res.status(400).json({ error: 'Erro no Stripe', details: error.message });
      }
      return res.status(500).json({ error: 'Erro interno ao reativar renovação' });
    }
  }
};

