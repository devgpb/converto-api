const { Tenant, Subscription, AuditBillingEvent } = require('../models');
const stripe = require('../utils/stripe');

/**
 * Processa eventos recebidos do Stripe e delega para handlers específicos.
 * Também registra o evento para auditoria e marca como processado.
 */
// Helper: safely convert Stripe unix seconds to JS Date or null
const toDateOrNull = (unixSeconds) => {
  const n = Number(unixSeconds);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : null;
};

const handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Verificar assinatura do webhook
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Erro na verificação do webhook:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Registrar evento para auditoria
    await AuditBillingEvent.create({
      type: event.type,
      payload_json: event,
      stripe_event_id: event.id
    });

    // Processar evento baseado no tipo
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;
      
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionCreatedOrUpdated(event.data.object);
        break;
      
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object);
        break;
      
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;
      
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;
      
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;
      
      default:
        console.log(`Evento não tratado: ${event.type}`);
    }

    // Marcar evento como processado
    await AuditBillingEvent.update(
      { processed_at: new Date() },
      { where: { stripe_event_id: event.id } }
    );

    res.json({ received: true });

  } catch (error) {
    console.error('Erro ao processar webhook:', error);
    res.status(500).json({ error: 'Erro interno ao processar webhook' });
  }
};

/**
 * Trata o evento de finalização de sessão de checkout.
 * Atualiza o status do tenant e registra a assinatura inicial.
 */
const handleCheckoutSessionCompleted = async (session) => {
  try {
    const tenantId = session.metadata?.tenant_id;
    if (!tenantId) {
      console.error('tenant_id não encontrado nos metadados da sessão');
      return;
    }

    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      console.error(`Tenant ${tenantId} não encontrado`);
      return;
    }

    // Atualizar status do tenant
    await tenant.update({
      status_billing: 'active'
    });

    // Se há subscription_id na sessão, buscar e salvar a subscription
    if (session.subscription) {
      const stripeSubscription = await stripe.subscriptions.retrieve(session.subscription);
      
      await Subscription.create({
        tenant_id: tenantId,
        stripe_subscription_id: stripeSubscription.id,
        stripe_price_id: stripeSubscription.items.data[0].price.id,
        quantity: stripeSubscription.items.data[0].quantity,
        status: stripeSubscription.status,
        cancel_at_period_end: !!stripeSubscription.cancel_at_period_end,
        current_period_end: toDateOrNull(stripeSubscription.current_period_end)
      });
    }

    console.log(`Checkout concluído para tenant ${tenantId}`);
  } catch (error) {
    console.error('Erro ao processar checkout.session.completed:', error);
    throw error;
  }
};

/**
 * Lida com criação ou atualização de uma assinatura no Stripe.
 * Sincroniza dados da assinatura e atualiza status de billing do tenant.
 */
const handleSubscriptionCreatedOrUpdated = async (subscription) => {
  try {
    const tenantId = subscription.metadata?.tenant_id;
    if (!tenantId) {
      console.error('tenant_id não encontrado nos metadados da subscription');
      return;
    }

    const existingSubscription = await Subscription.findOne({
      where: { stripe_subscription_id: subscription.id }
    });

    const subscriptionData = {
      tenant_id: tenantId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: subscription.items.data[0].price.id,
      quantity: subscription.items.data[0].quantity,
      status: subscription.status,
      cancel_at_period_end: !!subscription.cancel_at_period_end,
      current_period_end: toDateOrNull(subscription.current_period_end)
    };

    if (existingSubscription) {
      await existingSubscription.update(subscriptionData);
    } else {
      await Subscription.create(subscriptionData);
    }

    // Atualizar status do tenant baseado no status da subscription
    const tenant = await Tenant.findByPk(tenantId);
    if (tenant) {
      let billingStatus = 'active';
      if (['past_due', 'canceled', 'unpaid'].includes(subscription.status)) {
        billingStatus = subscription.status;
      }
      
      await tenant.update({ status_billing: billingStatus });
    }

    console.log(`Subscription ${subscription.status} para tenant ${tenantId}`);
  } catch (error) {
    console.error('Erro ao processar subscription created/updated:', error);
    throw error;
  }
};

/**
 * Atualiza registros quando uma assinatura é cancelada no Stripe.
 */
const handleSubscriptionDeleted = async (subscription) => {
  try {
    const existingSubscription = await Subscription.findOne({
      where: { stripe_subscription_id: subscription.id }
    });

    if (existingSubscription) {
      await existingSubscription.update({ status: 'canceled' });
      
      // Atualizar status do tenant
      const tenant = await Tenant.findByPk(existingSubscription.tenant_id);
      if (tenant) {
        await tenant.update({ status_billing: 'canceled' });
      }
    }

    console.log(`Subscription cancelada: ${subscription.id}`);
  } catch (error) {
    console.error('Erro ao processar subscription deleted:', error);
    throw error;
  }
};

/**
 * Atualiza o status de cobrança do tenant quando uma fatura é paga.
 */
const handleInvoicePaid = async (invoice) => {
  try {
    if (invoice.subscription) {
      const subscription = await Subscription.findOne({
        where: { stripe_subscription_id: invoice.subscription }
      });

      if (subscription) {
        const tenant = await Tenant.findByPk(subscription.tenant_id);
        if (tenant) {
          await tenant.update({ status_billing: 'active' });
        }
      }
    }

    console.log(`Invoice paga: ${invoice.id}`);
  } catch (error) {
    console.error('Erro ao processar invoice.paid:', error);
    throw error;
  }
};

/**
 * Define o tenant como inadimplente quando o pagamento da fatura falha.
 */
const handleInvoicePaymentFailed = async (invoice) => {
  try {
    if (invoice.subscription) {
      const subscription = await Subscription.findOne({
        where: { stripe_subscription_id: invoice.subscription }
      });

      if (subscription) {
        const tenant = await Tenant.findByPk(subscription.tenant_id);
        if (tenant) {
          await tenant.update({ status_billing: 'past_due' });
        }
      }
    }

    console.log(`Falha no pagamento da invoice: ${invoice.id}`);
  } catch (error) {
    console.error('Erro ao processar invoice.payment_failed:', error);
    throw error;
  }
};

/**
 * Processa Payment Intents concluídos para métodos assíncronos.
 * Garante que o tenant fique ativo após confirmação do pagamento.
 */
const handlePaymentIntentSucceeded = async (paymentIntent) => {
  try {
    // Para pagamentos assíncronos como Boleto e Pix
    if (paymentIntent.invoice) {
      const invoice = await stripe.invoices.retrieve(paymentIntent.invoice);
      if (invoice.subscription) {
        const subscription = await Subscription.findOne({
          where: { stripe_subscription_id: invoice.subscription }
        });

        if (subscription) {
          const tenant = await Tenant.findByPk(subscription.tenant_id);
          if (tenant) {
            await tenant.update({ status_billing: 'active' });
          }
        }
      }
    }

    console.log(`Payment Intent bem-sucedido: ${paymentIntent.id}`);
  } catch (error) {
    console.error('Erro ao processar payment_intent.succeeded:', error);
    throw error;
  }
};

/**
 * Processa Payment Intents que falharam em métodos de pagamento assíncronos.
 * Atualiza o status do tenant para past_due quando necessário.
 */
const handlePaymentIntentFailed = async (paymentIntent) => {
  try {
    // Para pagamentos assíncronos que falharam
    if (paymentIntent.invoice) {
      const invoice = await stripe.invoices.retrieve(paymentIntent.invoice);
      if (invoice.subscription) {
        const subscription = await Subscription.findOne({
          where: { stripe_subscription_id: invoice.subscription }
        });

        if (subscription) {
          const tenant = await Tenant.findByPk(subscription.tenant_id);
          if (tenant) {
            await tenant.update({ status_billing: 'past_due' });
          }
        }
      }
    }

    console.log(`Payment Intent falhou: ${paymentIntent.id}`);
  } catch (error) {
    console.error('Erro ao processar payment_intent.payment_failed:', error);
    throw error;
  }
};

module.exports = {
  handleStripeWebhook
};

