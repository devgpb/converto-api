const { CancellationReason } = require('../models');

/**
 * Lista motivos de cancelamento do tenant autenticado.
 * Restrito a admin/moderator via rota.
 */
const listCancellationReasons = async (req, res) => {
  try {
    if (!req.tenant) {
      return res.status(400).json({ error: 'Tenant não encontrado' });
    }

    const items = await CancellationReason.findAll({
      where: { tenant_id: req.tenant.id },
      order: [['created_at', 'DESC']],
    });

    res.json({ items });
  } catch (error) {
    console.error('Erro ao listar motivos de cancelamento:', error);
    res.status(500).json({ error: 'Erro interno ao listar motivos de cancelamento' });
  }
};

module.exports = {
  listCancellationReasons,
};

