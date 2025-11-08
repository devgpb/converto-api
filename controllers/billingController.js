const { Tenant, Subscription, CancellationReason, User, Enterprise } = require('../models');
const { Op } = require('sequelize');
const stripe = require('../utils/stripe');
const { v4: uuidv4 } = require('uuid');

const TRIAL_PERIOD_DAYS = Number.isFinite(Number(process.env.STRIPE_TRIAL_DAYS))
  ? Number(process.env.STRIPE_TRIAL_DAYS)
  : 7;

// Helper: converte timestamp do Stripe (segundos) para Date ou null
const toDateOrNull = (unixSeconds) => {
  const n = Number(unixSeconds);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : null;
};

const buildSubscriptionDataFromStripe = (subscription, tenantId) => ({
  tenant_id: tenantId,
  stripe_subscription_id: subscription.id,
  stripe_price_id: subscription.items.data[0]?.price?.id || null,
  quantity: subscription.items.data[0]?.quantity || 0,
  status: subscription.status,
  cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
  current_period_end: toDateOrNull(subscription.current_period_end)
});

const parsePositiveInteger = (value) => {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    return null;
  }
  return num;
};

const userHasEnterpriseColumn = Boolean(User?.rawAttributes?.enterprise_id);

const getEnterpriseIdForTenant = async (tenant) => {
  if (!tenant) return null;
  if (tenant.enterprise?.id) {
    return tenant.enterprise.id;
  }
  const enterpriseRecord = await Enterprise.findOne({ where: { tenant_id: tenant.id } });
  return enterpriseRecord ? enterpriseRecord.id : null;
};

const computeSeatCountFromEnterprise = async (tenant) => {
  if (!tenant) return null;

  if (userHasEnterpriseColumn) {
    const enterpriseId = await getEnterpriseIdForTenant(tenant);
    if (enterpriseId) {
      const activeByEnterprise = await User.count({
        where: { enterprise_id: enterpriseId, is_active: true }
      });
      if (activeByEnterprise > 0) {
        return activeByEnterprise;
      }

      const totalByEnterprise = await User.count({ where: { enterprise_id: enterpriseId } });
      if (totalByEnterprise > 0) {
        return totalByEnterprise;
      }
    }
  }

  const activeByTenant = await User.count({
    where: { tenant_id: tenant.id, is_active: true }
  });
  if (activeByTenant > 0) {
    return activeByTenant;
  }

  const totalByTenant = await User.count({ where: { tenant_id: tenant.id } });
  if (totalByTenant > 0) {
    return totalByTenant;
  }

  return null;
};

const resolveFallbackPlan = async ({ tenant, priceIdFromBody, seatCountFromBody }) => {
  const envPriceId = process.env.STRIPE_DEFAULT_PRICE_ID;
  const priceId = typeof priceIdFromBody === 'string' && priceIdFromBody.trim().length
    ? priceIdFromBody.trim()
    : envPriceId;

  if (!priceId) {
    return null;
  }

  const bodySeatCount = parsePositiveInteger(seatCountFromBody);
  const enterpriseSeatCount = await computeSeatCountFromEnterprise(tenant);
  const envSeatCount = parsePositiveInteger(process.env.STRIPE_DEFAULT_SEAT_COUNT);
  const quantity = bodySeatCount || enterpriseSeatCount || envSeatCount || 1;

  return { priceId, quantity };
};

const createReactivationCheckout = async ({
  tenant,
  priceId,
  quantity,
  success_url,
  cancel_url,
  previousSubscriptionId,
  isFallback = false
}) => {
  const metadata = {
    tenant_id: tenant.id,
    reactivation: 'true',
    seat_count: quantity.toString()
  };

  if (previousSubscriptionId) {
    metadata.previous_subscription_id = previousSubscriptionId;
  }

  if (isFallback) {
    metadata.fallback_checkout = 'true';
  }

  const subscriptionMetadata = {
    tenant_id: tenant.id,
    reactivation_source: previousSubscriptionId || (isFallback ? 'fallback' : '')
  };

  const idempotencyKey = `reactivation-${tenant.id}-${previousSubscriptionId || priceId}-${uuidv4()}`;

  const session = await stripe.checkout.sessions.create({
    customer: tenant.stripe_customer_id,
    payment_method_types: ['card'],
    line_items: [{
      price: priceId,
      quantity
    }],
    mode: 'subscription',
    success_url,
    cancel_url,
    subscription_data: {
      metadata: subscriptionMetadata
    },
    metadata
  }, { idempotencyKey });

  return session;
};

const determineBillingStatusFromStripe = (stripeSubscriptions, currentStatus = 'canceled') => {
  if (!stripeSubscriptions.length) {
    return 'canceled';
  }

  if (stripeSubscriptions.some((sub) => ['active', 'trialing'].includes(sub.status))) {
    return 'active';
  }

  if (stripeSubscriptions.some((sub) => sub.status === 'past_due')) {
    return 'past_due';
  }

  if (stripeSubscriptions.some((sub) => sub.status === 'unpaid')) {
    return 'unpaid';
  }

  if (stripeSubscriptions.some((sub) => sub.status === 'incomplete')) {
    return 'incomplete';
  }

  if (stripeSubscriptions.some((sub) => sub.status === 'incomplete_expired')) {
    return 'incomplete_expired';
  }

  if (stripeSubscriptions.some((sub) => sub.status === 'canceled')) {
    return 'canceled';
  }

  return currentStatus;
};

const syncTenantSubscriptionsFromStripe = async (tenant) => {
  const stripeSubscriptions = await stripe.subscriptions.list({
    customer: tenant.stripe_customer_id,
    status: 'all',
    expand: ['data.items.data.price']
  });

  const stripeIds = stripeSubscriptions.data.map((subscription) => subscription.id);
  const updated = [];

  for (const subscription of stripeSubscriptions.data) {
    const subscriptionData = buildSubscriptionDataFromStripe(subscription, tenant.id);

    const [record, created] = await Subscription.findOrCreate({
      where: { stripe_subscription_id: subscription.id },
      defaults: subscriptionData
    });

    if (!created) {
      await record.update(subscriptionData);
    }

    updated.push({
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      quantity: subscriptionData.quantity,
      cancel_at_period_end: subscriptionData.cancel_at_period_end,
      current_period_end: subscriptionData.current_period_end
    });
  }

  if (stripeIds.length > 0) {
    await Subscription.update(
      { status: 'canceled' },
      {
        where: {
          tenant_id: tenant.id,
          stripe_subscription_id: { [Op.notIn]: stripeIds }
        }
      }
    );
  }

  const billingStatus = determineBillingStatusFromStripe(stripeSubscriptions.data, tenant.status_billing);
  if (billingStatus !== tenant.status_billing) {
    await tenant.update({ status_billing: billingStatus });
  }

  return {
    stripeSubscriptions: stripeSubscriptions.data,
    updated,
    billingStatus
  };
};

/**
 * Cria uma sessão de checkout no Stripe para iniciar uma assinatura.
 * Gera chave de idempotência e configura metadados do tenant.
 */
const createCheckoutSession = async (req, res) => {
  try {
    const { tenant_id, price_id, seatCountInicial, success_url, cancel_url } = req.body;

    // Verificar se o tenant existe
    const tenant = await Tenant.findByPk(tenant_id, {
      include: [{ model: Enterprise, as: 'enterprise' }]
    });
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    if (!tenant.stripe_customer_id) {
      return res.status(400).json({ error: 'Tenant não possui customer_id do Stripe' });
    }

    // Gerar chave de idempotência
    const idempotencyKey = uuidv4();

    // Criar checkout session no Stripe
    const subscriptionData = {
      metadata: {
        tenant_id: tenant_id
      }
    };

    if (TRIAL_PERIOD_DAYS > 0) {
      subscriptionData.trial_period_days = TRIAL_PERIOD_DAYS;
    }

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
      subscription_data: subscriptionData,
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

/**
   * Sincroniza manualmente as assinaturas do tenant com o Stripe.
   * Útil quando o webhook estava desativado e o estado local ficou desatualizado.
   */
const syncSubscription = async (req, res) => {
  try {
    const { tenant_id } = req.body;

    const tenant = await Tenant.findByPk(tenant_id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }
    if (!tenant.stripe_customer_id) {
      return res.status(400).json({ error: 'Tenant não possui customer_id do Stripe' });
    }

    const { updated, billingStatus } = await syncTenantSubscriptionsFromStripe(tenant);

    return res.json({
      message: 'Assinaturas sincronizadas com sucesso',
      tenant_id: tenant.id,
      status_billing: billingStatus,
      subscriptions: updated
    });

  } catch (error) {
    console.error('Erro ao sincronizar assinatura com Stripe:', error);

    if (error.type === 'StripeError') {
      return res.status(400).json({
        error: 'Erro ao consultar assinaturas no Stripe',
        details: error.message
      });
    }

    return res.status(500).json({
      error: 'Erro interno do servidor ao sincronizar assinatura'
    });
  }
}
/**
 * Cancela a renovação automática (cancel_at_period_end = true)
 * Apenas Admin/Moderator (validado na rota). Requer tenant_id no body.
 */
const cancelSubscription = async (req, res) => {
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
}
/**
 * Reverte o cancelamento (cancel_at_period_end = false)
 */
const resumeSubscription = async (req, res) => {
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

/**
 * Gera um novo checkout para reativar uma assinatura totalmente cancelada.
 * Cria nova assinatura usando o mesmo price e quantidade da última assinatura conhecida.
 */
const reactivateSubscription = async (req, res) => {
  try {
    const { tenant_id, success_url, cancel_url, price_id, seatCountInicial } = req.body;

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

    await syncTenantSubscriptionsFromStripe(tenant);

    const existingSubscription = await Subscription.findOne({
      where: {
        tenant_id,
        status: { [Op.in]: ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'] }
      }
    });

    if (existingSubscription) {
      return res.status(400).json({
        error: 'Já existe uma assinatura vigente ou pendente; não é necessário reativar agora.'
      });
    }

    let lastSubscription = await Subscription.findOne({
      where: { tenant_id },
      order: [['updated_at', 'DESC']]
    });

    if (!lastSubscription) {
      await syncTenantSubscriptionsFromStripe(tenant);
      lastSubscription = await Subscription.findOne({
        where: { tenant_id },
        order: [['updated_at', 'DESC']]
      });
    }

    if (!lastSubscription) {
      const fallbackPlan = await resolveFallbackPlan({
        tenant,
        priceIdFromBody: price_id,
        seatCountFromBody: seatCountInicial
      });
      if (!fallbackPlan) {
        return res.status(400).json({
          error: 'Não foi possível determinar o plano para criar a nova assinatura. Informe um price_id ou configure STRIPE_DEFAULT_PRICE_ID.'
        });
      }

      const session = await createReactivationCheckout({
        tenant,
        priceId: fallbackPlan.priceId,
        quantity: fallbackPlan.quantity,
        success_url,
        cancel_url,
        previousSubscriptionId: null,
        isFallback: true
      });

      return res.status(201).json({
        message: 'Checkout criado para nova assinatura',
        checkout_url: session.url,
        session_id: session.id,
        fallback_used: true
      });
    }

    if (lastSubscription.status !== 'canceled') {
      return res.status(404).json({
        error: 'Nenhuma assinatura cancelada encontrada para reativar.'
      });
    }

    let priceIdToUse = lastSubscription.stripe_price_id;
    let quantity = Number.isInteger(lastSubscription.quantity) && lastSubscription.quantity > 0
      ? lastSubscription.quantity
      : 1;
    let fallbackUsed = false;

    if (!priceIdToUse) {
      const fallbackPlan = await resolveFallbackPlan({
        tenant,
        priceIdFromBody: price_id,
        seatCountFromBody: seatCountInicial
      });
      if (!fallbackPlan) {
        return res.status(400).json({
          error: 'A assinatura anterior não possui price configurado. Informe price_id ou configure STRIPE_DEFAULT_PRICE_ID.'
        });
      }
      priceIdToUse = fallbackPlan.priceId;
      quantity = fallbackPlan.quantity;
      fallbackUsed = true;
    }

    const session = await createReactivationCheckout({
      tenant,
      priceId: priceIdToUse,
      quantity,
      success_url,
      cancel_url,
      previousSubscriptionId: lastSubscription.stripe_subscription_id || null,
      isFallback: fallbackUsed
    });

    return res.status(201).json({
      message: fallbackUsed ? 'Checkout de reativação criado com dados padrão' : 'Checkout de reativação criado com sucesso',
      checkout_url: session.url,
      session_id: session.id,
      fallback_used: fallbackUsed
    });
  } catch (error) {
    console.error('Erro ao gerar checkout de reativação:', error);
    if (error.type === 'StripeError') {
      return res.status(400).json({ error: 'Erro no Stripe', details: error.message });
    }
    return res.status(500).json({ error: 'Erro interno ao gerar checkout de reativação' });
  }
};

module.exports = {
  createCheckoutSession,
  createPortalSession,
  getSubscriptionStatus,
  syncSubscription,
  cancelSubscription,
  resumeSubscription,
  reactivateSubscription
};
