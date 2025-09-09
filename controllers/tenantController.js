const { Tenant, Enterprise } = require('../models');
const stripe = require('../utils/stripe');

/**
 * Cria um novo tenant e um customer correspondente no Stripe.
 */
const createTenant = async (req, res) => {
  try {
    const { name, email, enterprise_name, enterprise_cnpj } = req.body;

    // Criar customer no Stripe
    const stripeCustomer = await stripe.customers.create({
      name: name,
      email: email,
      metadata: {
        tenant_name: name
      }
    });

    // Criar tenant no banco de dados
    const tenant = await Tenant.create({
      name: name,
      stripe_customer_id: stripeCustomer.id,
      status_billing: 'incomplete'
    });

    // Criar enterprise associada
    await Enterprise.create({
      tenant_id: tenant.id,
      name: enterprise_name || name,
      cnpj: enterprise_cnpj || null,
    });

    res.status(201).json({
      id: tenant.id,
      name: tenant.name,
      stripe_customer_id: tenant.stripe_customer_id,
      status_billing: tenant.status_billing,
      created_at: tenant.created_at
    });

  } catch (error) {
    console.error('Erro ao criar tenant:', error);
    
    if (error.type === 'StripeError') {
      return res.status(400).json({ 
        error: 'Erro ao criar customer no Stripe',
        details: error.message 
      });
    }

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ 
        error: 'Tenant com este stripe_customer_id já existe' 
      });
    }

    res.status(500).json({ 
      error: 'Erro interno do servidor ao criar tenant' 
    });
  }
};

/**
 * Busca um tenant pelo ID incluindo assinaturas e usuários relacionados.
 */
const getTenant = async (req, res) => {
  try {
    const { id } = req.params;
    
    const tenant = await Tenant.findByPk(id, {
      include: ['subscriptions', 'users']
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    res.json(tenant);

  } catch (error) {
    console.error('Erro ao buscar tenant:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor ao buscar tenant' 
    });
  }
};

/**
 * Atualiza dados do tenant tanto localmente quanto no Stripe quando necessário.
 */
const updateTenant = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const tenant = await Tenant.findByPk(id);

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    // Atualizar no Stripe se necessário
    if (name && name !== tenant.name) {
      await stripe.customers.update(tenant.stripe_customer_id, {
        name: name,
        metadata: {
          tenant_name: name
        }
      });
    }

    // Atualizar no banco de dados
    await tenant.update({ name: name || tenant.name });

    res.json({
      id: tenant.id,
      name: tenant.name,
      stripe_customer_id: tenant.stripe_customer_id,
      status_billing: tenant.status_billing,
      updated_at: tenant.updated_at
    });

  } catch (error) {
    console.error('Erro ao atualizar tenant:', error);
    
    if (error.type === 'StripeError') {
      return res.status(400).json({ 
        error: 'Erro ao atualizar customer no Stripe',
        details: error.message 
      });
    }

    res.status(500).json({ 
      error: 'Erro interno do servidor ao atualizar tenant' 
    });
  }
};

module.exports = {
  createTenant,
  getTenant,
  updateTenant
};
