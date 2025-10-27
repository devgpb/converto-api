const models = require('../models');
const { formataTexto } = require('../utils/utils');

function normalizeName(nome) {
  if (!nome) return '';
  return formataTexto(String(nome).trim());
}

exports.listStatus = async (req, res) => {
  try {
    const whereEnterprise = req.user.role === 'moderator' ? {} : { enterprise_id: req.enterprise.id };

    const mestres = await models.ClienteStatus.findAll({
      where: whereEnterprise,
      attributes: ['id', 'nome', 'enterprise_id', 'ordem'],
      order: [['ordem', 'ASC'], ['nome', 'ASC']],
      raw: true,
    });
    const itens = [];
    for (const row of mestres) {
      const qtd = await models.Clientes.count({ where: { deleted_at: null, status: row.id, ...(req.user.role === 'moderator' ? {} : { enterprise_id: req.enterprise.id }) } });
      itens.push({ id: row.id, nome: row.nome, qtd_clientes: qtd, ordem: row.ordem ?? 0 });
    }
    return res.json({ items: itens });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

exports.createStatus = async (req, res) => {
  try {
    const enterpriseId = req.user?.tenant?.enterprise?.id || req.enterprise?.id;
    if (!enterpriseId) return res.status(400).json({ error: 'Empresa não identificada' });

    const nome = normalizeName(req.body?.nome);
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });

    const exists = await models.ClienteStatus.findOne({ where: { enterprise_id: enterpriseId, nome } });
    if (exists) return res.status(409).json({ error: 'Status já cadastrado' });

    // Define ordem como próximo número
    const max = await models.ClienteStatus.max('ordem', { where: { enterprise_id: enterpriseId } });
    const ordem = Number.isFinite(max) ? (max + 1) : 0;
    const created = await models.ClienteStatus.create({ enterprise_id: enterpriseId, nome, ordem });
    return res.status(201).json(created);
  } catch (e) {
    if (e?.original?.code === '42P01') {
      return res.status(400).json({ error: 'Tabelas de Campos de Clientes não existem. Rode as migrações do banco.' });
    }
    return res.status(500).json({ error: e.message });
  }
};

exports.listCampanhas = async (req, res) => {
  try {
    const whereEnterprise = req.user.role === 'moderator' ? {} : { enterprise_id: req.enterprise.id };

    const mestres = await models.ClienteCampanha.findAll({
      where: whereEnterprise,
      attributes: ['id', 'nome', 'enterprise_id'],
      order: [['nome', 'ASC']],
      raw: true,
    });
    const itens = [];
    for (const row of mestres) {
      const qtd = await models.Clientes.count({ where: { deleted_at: null, campanha: row.id, ...(req.user.role === 'moderator' ? {} : { enterprise_id: req.enterprise.id }) } });
      itens.push({ id: row.id, nome: row.nome, qtd_clientes: qtd });
    }
    return res.json({ items: itens });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

exports.createCampanha = async (req, res) => {
  try {
    const enterpriseId = req.user?.tenant?.enterprise?.id || req.enterprise?.id;
    if (!enterpriseId) return res.status(400).json({ error: 'Empresa não identificada' });

    const nome = normalizeName(req.body?.nome);
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });

    const exists = await models.ClienteCampanha.findOne({ where: { enterprise_id: enterpriseId, nome } });
    if (exists) return res.status(409).json({ error: 'Campanha já cadastrada' });

    const created = await models.ClienteCampanha.create({ enterprise_id: enterpriseId, nome });
    return res.status(201).json(created);
  } catch (e) {
    if (e?.original?.code === '42P01') {
      return res.status(400).json({ error: 'Tabelas de Campos de Clientes não existem. Rode as migrações do banco.' });
    }
    return res.status(500).json({ error: e.message });
  }
};

exports.getFiltros = async (req, res) => {
  try {
    const whereEnterprise = req.user.role === 'moderator' ? {} : { enterprise_id: req.enterprise.id };

    // Busca listas mestre com ids e nomes, e cidades distintas dos clientes
    const [rowsStatus, rowsCampanhas, distCidades] = await Promise.all([
      models.ClienteStatus.findAll({
        where: whereEnterprise,
        attributes: ['id', 'nome', 'ordem'],
        order: [['ordem', 'ASC'], ['nome', 'ASC']],
        raw: true,
      }),
      models.ClienteCampanha.findAll({
        where: whereEnterprise,
        attributes: ['id', 'nome'],
        order: [['nome', 'ASC']],
        raw: true,
      }),
      models.Clientes.aggregate('cidade', 'DISTINCT', { plain: false, where: { ...whereEnterprise, deleted_at: null } }),
    ]);

    const status = rowsStatus.map(s => ({ id: s.id, nome: s.nome }));
    const campanhas = rowsCampanhas.map(c => ({ id: c.id, nome: c.nome }));
    const cidades = distCidades
      .map(c => c.DISTINCT)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'pt', { sensitivity: 'base' }));

    return res.json({ cidades, status, campanhas });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

// PATCH /status/ordenacao -> { ids: number[] }
exports.reorderStatus = async (req, res) => {
  const t = await models.sequelize.transaction();
  try {
    const enterpriseId = req.user?.tenant?.enterprise?.id || req.enterprise?.id;
    if (!enterpriseId) return res.status(400).json({ error: 'Empresa não identificada' });

    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ error: 'Lista de ids é obrigatória' });

    // Carrega todos os status da empresa
    const all = await models.ClienteStatus.findAll({ where: { enterprise_id: enterpriseId }, order: [['ordem','ASC'],['id','ASC']], transaction: t });
    const byId = new Map(all.map(s => [s.id, s]));

    // Valida ids
    for (const id of ids) {
      if (!byId.has(id)) {
        await t.rollback();
        return res.status(400).json({ error: `Status ${id} não pertence à empresa` });
      }
    }

    // Aplica nova ordem: itens informados primeiro, depois os faltantes preservando ordem atual
    const remaining = all.filter(s => !ids.includes(s.id)).map(s => s.id);
    const finalOrder = [...ids, ...remaining];

    // Evita violar unique (enterprise_id, ordem): libera o intervalo primeiro
    await models.sequelize.query(
      'UPDATE cliente_status SET ordem = ordem + 1000000 WHERE enterprise_id = :enterpriseId',
      { replacements: { enterpriseId }, transaction: t }
    );

    // Atribui ordens finais 0..n-1
    for (let pos = 0; pos < finalOrder.length; pos++) {
      const id = finalOrder[pos];
      await models.ClienteStatus.update({ ordem: pos }, { where: { id, enterprise_id: enterpriseId }, transaction: t });
    }

    await t.commit();
    return res.json({ success: true });
  } catch (e) {
    try { await t.rollback(); } catch (_) {}
    return res.status(500).json({ error: e.message });
  }
};

exports.deleteStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const whereEnterprise = req.user.role === 'moderator' ? {} : { enterprise_id: req.enterprise.id };
    const row = await models.ClienteStatus.findByPk(id);
    if (!row) return res.status(404).json({ error: 'Status não encontrado' });
    if (req.user.role !== 'moderator' && row.enterprise_id !== req.enterprise.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    // Verifica uso direto via FK em clientes.status (modelo atual)
    const qtd = await models.Clientes.count({ where: { deleted_at: null, status: row.id, ...(req.user.role === 'moderator' ? {} : { enterprise_id: req.enterprise.id }) } });
    if (qtd > 0) {
      return res.status(409).json({ error: 'Existem clientes com este status. Remova ou altere antes de excluir.' });
    }
    await row.destroy();
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

exports.deleteCampanha = async (req, res) => {
  try {
    const { id } = req.params;
    const whereEnterprise = req.user.role === 'moderator' ? {} : { enterprise_id: req.enterprise.id };
    const row = await models.ClienteCampanha.findByPk(id);
    if (!row) return res.status(404).json({ error: 'Campanha não encontrada' });
    if (req.user.role !== 'moderator' && row.enterprise_id !== req.enterprise.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    // Verifica uso direto via FK em clientes.campanha (modelo atual)
    const qtd = await models.Clientes.count({ where: { deleted_at: null, campanha: row.id, ...(req.user.role === 'moderator' ? {} : { enterprise_id: req.enterprise.id }) } });
    if (qtd > 0) {
      return res.status(409).json({ error: 'Existem clientes nesta campanha. Remova ou altere antes de excluir.' });
    }
    await row.destroy();
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
