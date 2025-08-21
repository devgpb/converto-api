const { Enterprise } = require('../models');

const createEnterprise = async (req, res) => {
  try {
    const { name, tenant_id } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    const targetTenantId = req.user.role === 'admin' && tenant_id ? tenant_id : req.tenant.id;

    const existing = await Enterprise.findOne({ where: { tenant_id: targetTenantId } });
    if (existing) {
      return res.status(400).json({ error: 'Tenant já possui enterprise' });
    }

    const enterprise = await Enterprise.create({ tenant_id: targetTenantId, name });
    res.status(201).json(enterprise);
  } catch (error) {
    console.error('Erro ao criar enterprise:', error);
    res.status(500).json({ error: 'Erro interno ao criar enterprise' });
  }
};

const listEnterprises = async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const enterprises = await Enterprise.findAll();
      return res.json(enterprises);
    }

    const enterprise = req.enterprise;
    if (!enterprise) {
      return res.status(404).json({ error: 'Enterprise não encontrada' });
    }
    res.json([enterprise]);
  } catch (error) {
    console.error('Erro ao listar enterprises:', error);
    res.status(500).json({ error: 'Erro interno ao listar enterprises' });
  }
};

const getEnterprise = async (req, res) => {
  try {
    const { id } = req.params;
    const enterprise = await Enterprise.findByPk(id);

    if (!enterprise) {
      return res.status(404).json({ error: 'Enterprise não encontrada' });
    }

    if (req.user.role !== 'admin' && enterprise.tenant_id !== req.tenant.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    res.json(enterprise);
  } catch (error) {
    console.error('Erro ao buscar enterprise:', error);
    res.status(500).json({ error: 'Erro interno ao buscar enterprise' });
  }
};

const updateEnterprise = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const enterprise = await Enterprise.findByPk(id);

    if (!enterprise) {
      return res.status(404).json({ error: 'Enterprise não encontrada' });
    }

    if (req.user.role !== 'admin' && enterprise.tenant_id !== req.tenant.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    await enterprise.update({ name: name || enterprise.name });
    res.json(enterprise);
  } catch (error) {
    console.error('Erro ao atualizar enterprise:', error);
    res.status(500).json({ error: 'Erro interno ao atualizar enterprise' });
  }
};

const deleteEnterprise = async (req, res) => {
  try {
    const { id } = req.params;
    const enterprise = await Enterprise.findByPk(id);

    if (!enterprise) {
      return res.status(404).json({ error: 'Enterprise não encontrada' });
    }

    if (req.user.role !== 'admin' && enterprise.tenant_id !== req.tenant.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    await enterprise.destroy();
    res.status(204).send();
  } catch (error) {
    console.error('Erro ao deletar enterprise:', error);
    res.status(500).json({ error: 'Erro interno ao deletar enterprise' });
  }
};

module.exports = {
  createEnterprise,
  listEnterprises,
  getEnterprise,
  updateEnterprise,
  deleteEnterprise,
};

