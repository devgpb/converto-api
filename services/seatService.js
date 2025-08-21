const { Tenant, Subscription, User } = require('../models');
const stripe = require('../utils/stripe');

const syncSeatsForTenant = async (tenantId) => {
  // Verificar se o tenant existe
  const tenant = await Tenant.findByPk(tenantId, {
    include: [{
      model: Subscription,
      as: 'subscriptions',
      where: { status: ['active', 'trialing'] },
      required: false
    }]
  });

  if (!tenant) {
    const error = new Error('Tenant não encontrado');
    error.status = 404;
    throw error;
  }

  const activeSubscription = tenant.subscriptions.find(sub =>
    ['active', 'trialing'].includes(sub.status)
  );

  if (!activeSubscription) {
    const error = new Error('Nenhuma assinatura ativa encontrada para este tenant');
    error.status = 400;
    throw error;
  }

  // Contar usuários ativos
  const activeUsersCount = await User.count({
    where: {
      tenant_id: tenantId,
      is_active: true
    }
  });

  // Buscar a subscription no Stripe para obter o subscription item ID
  const stripeSubscription = await stripe.subscriptions.retrieve(
    activeSubscription.stripe_subscription_id
  );

  const subscriptionItemId = stripeSubscription.items.data[0].id;

  const previousQuantity = activeSubscription.quantity;

  // Atualizar quantidade no Stripe
  await stripe.subscriptionItems.update(subscriptionItemId, {
    quantity: activeUsersCount,
    proration_behavior: 'always_invoice' // Sempre fazer proration ao adicionar
  });

  // Atualizar quantidade no banco de dados local
  await activeSubscription.update({
    quantity: activeUsersCount
  });

  return {
    message: 'Quantidade de assentos sincronizada com sucesso',
    tenant_id: tenantId,
    previous_quantity: previousQuantity,
    new_quantity: activeUsersCount,
    active_users_count: activeUsersCount
  };
};

module.exports = {
  syncSeatsForTenant
};

