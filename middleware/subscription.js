const { Subscription } = require('../models');
const { Op } = require('sequelize');

// Middleware to ensure the tenant has an active subscription
const requireActiveSubscription = async (req, res, next) => {
  try {
    // Tenant is set on req by authenticateToken middleware
    const tenant = req.tenant;
    if (!tenant) {
      return res.status(400).json({ error: 'Tenant não encontrado' });
    }

    const activeSubscription = await Subscription.findOne({
      where: {
        tenant_id: tenant.id,
        status: { [Op.in]: ['active', 'trialing'] }
      }
    });

    if (!activeSubscription) {
      return res.status(402).json({ error: 'Assinatura inativa ou pagamento pendente' });
    }

    next();
  } catch (error) {
    console.error('Erro ao verificar assinatura:', error);
    res.status(500).json({ error: 'Erro interno ao verificar assinatura' });
  }
};

module.exports = { requireActiveSubscription };

