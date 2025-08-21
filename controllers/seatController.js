const { Tenant, Subscription, User } = require('../models');
const stripe = require('../utils/stripe');
const { syncSeatsForTenant } = require('../services/seatService');

/**
 * Sincroniza a quantidade de assentos pagos com o número de usuários ativos.
 * Atualiza tanto o Stripe quanto o banco de dados local.
 */
const syncSeats = async (req, res) => {
  try {
    const { tenant_id } = req.body;
    const result = await syncSeatsForTenant(tenant_id);
    res.json(result);
  } catch (error) {
    console.error('Erro ao sincronizar assentos:', error);

    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }

    if (error.type === 'StripeError') {
      return res.status(400).json({
        error: 'Erro ao atualizar quantidade no Stripe',
        details: error.message
      });
    }

    res.status(500).json({
      error: 'Erro interno do servidor ao sincronizar assentos'
    });
  }
};

/**
 * Obtém informações sobre uso de assentos do tenant, incluindo
 * usuários ativos, total e quantidade de assentos pagos.
 */
const getSeatUsage = async (req, res) => {
  try {
    const { tenant_id } = req.params;

    const tenant = await Tenant.findByPk(tenant_id, {
      include: [{
        model: Subscription,
        as: 'subscriptions',
        where: { status: ['active', 'trialing'] },
        required: false
      }, {
        model: User,
        as: 'users'
      }]
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    const activeSubscription = tenant.subscriptions.find(sub => 
      ['active', 'trialing'].includes(sub.status)
    );

    const activeUsersCount = tenant.users.filter(user => user.is_active).length;
    const totalUsersCount = tenant.users.length;
    const paidSeats = activeSubscription ? activeSubscription.quantity : 0;

    res.json({
      tenant_id: tenant_id,
      paid_seats: paidSeats,
      active_users: activeUsersCount,
      total_users: totalUsersCount,
      seats_available: Math.max(0, paidSeats - activeUsersCount),
      needs_sync: paidSeats !== activeUsersCount,
      subscription_status: activeSubscription ? activeSubscription.status : 'none'
    });

  } catch (error) {
    console.error('Erro ao buscar uso de assentos:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor ao buscar uso de assentos' 
    });
  }
};

/**
 * Ativa um usuário específico e sincroniza os assentos após a ativação.
 */
const addSeat = async (req, res) => {
  try {
    const { tenant_id, user_id } = req.body;

    // Verificar se o usuário existe e pertence ao tenant
    const user = await User.findOne({
      where: { id: user_id, tenant_id: tenant_id }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado neste tenant' });
    }

    if (user.is_active) {
      return res.status(400).json({ error: 'Usuário já está ativo' });
    }

    // Ativar usuário
    await user.update({ is_active: true });

    // Sincronizar assentos automaticamente
    await syncSeatsForTenant(tenant_id);

    res.json({
      message: 'Assento adicionado e sincronizado com sucesso',
      user_id: user_id,
      tenant_id: tenant_id,
      user_active: true
    });

  } catch (error) {
    console.error('Erro ao adicionar assento:', error);

    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }

    if (error.type === 'StripeError') {
      return res.status(400).json({
        error: 'Erro ao atualizar quantidade no Stripe',
        details: error.message
      });
    }

    res.status(500).json({
      error: 'Erro interno do servidor ao adicionar assento'
    });
  }
};

/**
 * Desativa um usuário específico e ajusta a quantidade de assentos sem proration imediata.
 */
const removeSeat = async (req, res) => {
  try {
    const { tenant_id, user_id } = req.body;

    // Verificar se o usuário existe e pertence ao tenant
    const user = await User.findOne({
      where: { id: user_id, tenant_id: tenant_id }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado neste tenant' });
    }

    if (!user.is_active) {
      return res.status(400).json({ error: 'Usuário já está inativo' });
    }

    // Desativar usuário
    await user.update({ is_active: false });

    // Para remoção de assentos, podemos optar por não fazer proration imediata
    // Isso evita créditos imediatos, estratégia comum em per-seat
    const { tenant_id: tenantId } = req.body;
    
    const tenant = await Tenant.findByPk(tenantId, {
      include: [{
        model: Subscription,
        as: 'subscriptions',
        where: { status: ['active', 'trialing'] },
        required: false
      }]
    });

    const activeSubscription = tenant.subscriptions.find(sub => 
      ['active', 'trialing'].includes(sub.status)
    );

    if (activeSubscription) {
      const activeUsersCount = await User.count({
        where: {
          tenant_id: tenantId,
          is_active: true
        }
      });

      const stripeSubscription = await stripe.subscriptions.retrieve(
        activeSubscription.stripe_subscription_id
      );

      const subscriptionItemId = stripeSubscription.items.data[0].id;

      // Atualizar sem proration para evitar crédito imediato
      await stripe.subscriptionItems.update(subscriptionItemId, {
        quantity: activeUsersCount,
        proration_behavior: 'none' // Sem proration ao remover
      });

      await activeSubscription.update({
        quantity: activeUsersCount
      });
    }

    res.json({
      message: 'Assento removido com sucesso',
      user_id: user_id,
      tenant_id: tenant_id,
      user_active: false
    });

  } catch (error) {
    console.error('Erro ao remover assento:', error);
    
    if (error.type === 'StripeError') {
      return res.status(400).json({ 
        error: 'Erro ao atualizar quantidade no Stripe',
        details: error.message 
      });
    }

    res.status(500).json({ 
      error: 'Erro interno do servidor ao remover assento' 
    });
  }
};

module.exports = {
  syncSeats,
  getSeatUsage,
  addSeat,
  removeSeat
};

