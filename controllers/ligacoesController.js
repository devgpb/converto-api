const models = require('../models');
const { DateTime } = require('luxon');
const { Op } = models.Sequelize;
const getUpsert = require('../utils/rest').getDefaultUpsert;

const DEFAULT_TZ = 'America/Maceio';

// Helper: parse string to UTC JS Date using tz; accepts ISO or dd/MM/yyyy HH:mm
function parseToUtc(dateStr, tz) {
  if (!dateStr) return null;
  let dt = DateTime.fromISO(String(dateStr), { zone: tz });
  if (!dt.isValid) {
    dt = DateTime.fromFormat(String(dateStr), 'dd/LL/yyyy HH:mm', { zone: tz });
  }
  if (!dt.isValid) return null;
  return dt.toUTC().toJSDate();
}

// POST /api/ligacoes
// body: { id_ligacao?, id_usuario?, id_cliente, data_hora, tz?, atendida?, observacao? }
exports.postLigacao = async (req, res) => {
  try {
    const body = { ...req.body };

    // Default caller to current user if not provided
    if (!body.id_usuario) body.id_usuario = req.user?.id_usuario;

    // Basic validation
    if (!body.id_cliente) {
      return res.status(400).json({ error: 'id_cliente é obrigatório' });
    }
    if (!body.id_usuario) {
      return res.status(400).json({ error: 'id_usuario é obrigatório' });
    }

    const tz = body.tz || req.query.tz || DEFAULT_TZ;

    if (body.data_hora) {
      const utc = parseToUtc(body.data_hora, tz);
      if (!utc) {
        return res.status(400).json({ error: 'data_hora inválida' });
      }
      body.data_hora = utc;
    } else {
      body.data_hora = DateTime.now().toUTC().toJSDate();
    }

    // Use generic upsert helper
    req.body = body;
    return getUpsert(models.Ligacoes, 'id_ligacao')(req, res);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Erro ao salvar ligação' });
  }
};

// GET /api/ligacoes?id_usuario=<uuid>&tz=...&inicio=YYYY-MM-DD&fim=YYYY-MM-DD
// Lista ligações feitas por um usuário (caller)
exports.getLigacoesDoUsuario = async (req, res) => {
  try {
    const tz = req.query.tz || DEFAULT_TZ;
    const idUsuario = req.query.id_usuario || req.user?.id_usuario;
    if (!idUsuario) {
      return res.status(400).json({ error: 'id_usuario é obrigatório' });
    }

    const where = { id_usuario: idUsuario };

    const { inicio, fim } = req.query;
    if (inicio && fim) {
      const startLocal = DateTime.fromISO(String(inicio), { zone: tz });
      const endLocal = DateTime.fromISO(String(fim), { zone: tz });
      if (!startLocal.isValid || !endLocal.isValid) {
        return res.status(400).json({ error: "Formato de data inválido em 'inicio' ou 'fim'" });
      }
      const start = startLocal.toFormat('HHmmss') === '000000' ? startLocal.startOf('day') : startLocal;
      const end = endLocal.toFormat('HHmmss') === '000000' ? endLocal.endOf('day') : endLocal;
      where.data_hora = { [Op.between]: [start.toUTC().toJSDate(), end.toUTC().toJSDate()] };
    }

    // Se não for moderador, filtra por tenant através do relacionamento com User
    const include = [];
    if (req.user?.role !== 'moderator') {
      include.push({
        model: models.User,
        as: 'usuario',
        where: { tenant_id: req.user?.tenant_id },
        attributes: [],
        required: true,
      });
    }

    const registros = await models.Ligacoes.findAll({
      where,
      order: [['data_hora', 'DESC']],
      include,
    });

    const resposta = registros.map((r) => {
      const json = r.toJSON();
      json.dataHoraISO = DateTime.fromJSDate(new Date(json.data_hora), { zone: 'utc' }).toISO();
      json.dataHoraLocal = DateTime.fromJSDate(new Date(json.data_hora), { zone: 'utc' }).setZone(tz).toFormat('dd/MM/yyyy HH:mm');
      return json;
    });

    return res.json(resposta);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Erro ao listar ligações do usuário' });
  }
};

// GET /api/ligacoes/cliente/:id_cliente?tz=...&page=1&perPage=10
exports.getLigacoesDoCliente = async (req, res) => {
  try {
    const tz = req.query.tz || DEFAULT_TZ;
    const { id_cliente } = req.params;
    if (!id_cliente) return res.status(400).json({ error: 'id_cliente é obrigatório' });

    const where = { id_cliente };

    const include = [];
    if (req.user?.role !== 'moderator') {
      include.push({
        model: models.Clientes,
        as: 'cliente',
        where: { enterprise_id: req.enterprise?.id },
        attributes: [],
        required: true,
      });
    }

    // Include caller user for display
    include.push({
      model: models.User,
      as: 'usuario',
      attributes: ['id_usuario', 'name', 'email'],
      required: false,
    });

    // Pagination
    const page = Math.max(parseInt(req.query.page ?? '1', 10), 1);
    const perPage = Math.max(Math.min(parseInt(req.query.perPage ?? '10', 10), 100), 1);
    const offset = (page - 1) * perPage;

    const { rows, count } = await models.Ligacoes.findAndCountAll({
      where,
      order: [['data_hora', 'DESC']],
      include,
      limit: perPage,
      offset,
      distinct: true,
    });

    const data = rows.map((r) => {
      const json = r.toJSON();
      json.dataHoraISO = DateTime.fromJSDate(new Date(json.data_hora), { zone: 'utc' }).toISO();
      json.dataHoraLocal = DateTime.fromJSDate(new Date(json.data_hora), { zone: 'utc' }).setZone(tz).toFormat('dd/MM/yyyy HH:mm');
      return json;
    });

    const totalPages = Math.max(Math.ceil(count / perPage), 1);
    return res.json({ data, meta: { total: count, page, perPage, totalPages } });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Erro ao listar ligações do cliente' });
  }
};

// GET /api/ligacoes/usuarios
// Lista usuários do tenant para seleção ao fazer ligação
exports.listarUsuariosParaLigacao = async (req, res) => {
  try {
    const Sequelize = models.Sequelize;
    const { Op } = Sequelize;

    const page = Math.max(parseInt(req.query.page ?? '1', 10), 1);
    // suporta "quantidade" como atalho para limitar a lista sem paginação
    const quantidadeParam = req.query.quantidade ? parseInt(req.query.quantidade, 10) : undefined;
    const pageSizeReq = Math.max(parseInt(req.query.pageSize ?? String(quantidadeParam ?? '50'), 10), 1);
    const pageSize = Math.min(pageSizeReq, 100);
    const offset = (page - 1) * pageSize;

    const { search, status, cidade, sortBy, idUsuario } = req.query;
    const dia = parseDia(req.query.dia) || new Date().toISOString().slice(0, 10);
    const excluirLigadosHoje = (String(req.query.excluirLigadosHoje ?? 'true').toLowerCase() !== 'false');

    const where = { deletedAt: null };
    if (idUsuario && idUsuario !== 'null') where.idUsuario = idUsuario;
    if (status && status !== 'todos') where.status = { [Op.iLike]: status };
    if (cidade && cidade !== 'todas') where.cidade = { [Op.iLike]: cidade };

    if (search) {
      const normalized = String(search)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      const onlyDigits = String(search).replace(/\D/g, '');
      const orConds = [];
      orConds.push(
        Sequelize.where(
          Sequelize.fn('lower', Sequelize.fn('unaccent', Sequelize.col('Clientes.nome'))),
          { [Op.like]: `%${normalized}%` }
        )
      );
      orConds.push(
        Sequelize.where(
          Sequelize.fn('lower', Sequelize.fn('unaccent', Sequelize.col('Clientes.campanha'))),
          { [Op.like]: `%${normalized}%` }
        )
      );
      orConds.push(
        Sequelize.where(
          Sequelize.fn('lower', Sequelize.fn('unaccent', Sequelize.col('Clientes.status'))),
          { [Op.like]: `%${normalized}%` }
        )
      );
      orConds.push(
        Sequelize.where(
          Sequelize.fn('lower', Sequelize.fn('unaccent', Sequelize.col('Clientes.cidade'))),
          { [Op.like]: `%${normalized}%` }
        )
      );
      if (onlyDigits) {
        orConds.push(
          Sequelize.where(
            Sequelize.fn('regexp_replace', Sequelize.col('Clientes.celular'), '[^0-9]', '', 'g'),
            { [Op.like]: `%${onlyDigits}%` }
          )
        );
      } else {
        orConds.push({ celular: { [Op.iLike]: `%${search}%` } });
      }
      where[Op.or] = orConds;
    }

    // ordem aleatória dentro dos filtros
    let order = [Sequelize.literal('RANDOM()')];

    const include = [
      { model: models.Usuarios, as: 'responsavel', attributes: ['nomeCompleto', 'idUsuario'] },
      { model: models.Ligacoes, as: 'ligacoes', required: false, where: { data: dia }, attributes: [] },
    ];

    const whereFinal = excluirLigadosHoje
      ? { ...where, '$ligacoes.idLigacao$': null }
      : where;

    const { rows, count } = await models.Clientes.findAndCountAll({
      // por padrão exclui quem já recebeu ligação no dia; pode incluir via query
      where: whereFinal,
      include,
      order,
      limit: pageSize,
      offset,
      distinct: true,
      // Evita subquery que referencia alias de include no WHERE,
      // prevenindo erro "faltando entrada para tabela \"ligacoes\" na cláusula FROM".
      subQuery: false,
    });

    const total = count;
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    return res.json({
      data: rows,
      meta: { page, pageSize, total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 }
    });
  } catch (error) {
    console.error('Erro ao listar clientes para ligação:', error);
    return res.status(500).json({ error: 'Erro ao listar clientes para ligação.' });
  }
};
