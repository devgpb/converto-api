const models = require("../models");
const _upsert = require("../utils/rest").getDefaultUpsert(models.Clientes, "id_cliente");
const { Sequelize } = models
const { Op } = Sequelize;
const { formataTexto } = require('../utils/utils');
const moment = require('moment-timezone');

const TZ = 'America/Maceio';

function validaCampo(valor) {
  return valor !== undefined && valor !== null && valor !== '' && valor !== 'null';
}

// Conta quantos pedidos estão com status faltando
exports.postClientes = async (req, res) => {
  try {
    const { celular, id_cliente, nome, status, cidade, fechado } = req.body;
    const enterpriseId = req.user?.tenant?.enterprise?.id;


    // valida nome obrigatório
    if (!nome && !id_cliente) {
      return res
        .status(400)
        .json({ error: "O cliente precisa ter um nome." });
    }

    // se veio id_cliente, valida que existe
    let cliente = {}
    if(id_cliente){
      cliente = await models.Clientes.findByPk(id_cliente);
      if(!cliente){
        return res.status(404).json({ error: "Cliente não encontrado" });
      }
      if(req.user.role !== 'moderator' && cliente.enterprise_id !== enterpriseId){
        return res.status(403).json({ error: 'Acesso negado' });
      }
    }else{
      req.body.id_usuario = req.user.id_usuario;
    }


    // formata sempre o nome
    if(req.body.nome){
      req.body.nome = formataTexto(nome);
    }

    // formata status se veio no body e não vazio
    if (status) {
      const statusFormatado = formataTexto(status);
      const statusLower = statusFormatado.toLowerCase();

      // não permite mudar o status se já está fechado
      if(cliente.fechado != null && statusLower != "fechado"){
        return res.status(400).json({ error: "Cliente já está fechado, não pode mudar o status." });
      }

      // não permite mudar para fechado diretamente
      // tem que usar o campo "fechado" para isso
      if(!cliente.fechado && 
      (statusLower == "fechado" ||
      statusLower == "concluído" || statusLower == "fechou")){
        return res.status(400).json({ error: "Para fechar um cliente marque como fechado" });
      }
      req.body.status = statusFormatado;
    }

    if(cliente.fechado == null && validaCampo(fechado)){
      // se está sendo fechado agora, seta o timestamp
      req.body.status = "Fechado";
    }

    // Se for reaberto status fica null
    if(cliente.fechado != null && !validaCampo(fechado)){
      req.body.status = null;
    }
    
    // formata cidade se veio no body e não vazio
    if (cidade) {
      req.body.cidade = formataTexto(cidade);
    }

    // monta condição: mesmo celular, não soft-deleted
    const where = { deleted_at: null };
    if(req.user.role !== 'moderator'){
      where.enterprise_id = enterpriseId;
    }

    if(celular){
      where.celular = { [Op.iLike]: celular };
    }
    if (id_cliente) {
      // no update, ignora o próprio registro
      where.id_cliente = { [Op.ne]: id_cliente };
    }

    // verifica duplicata de celular
    const existe = await models.Clientes.findOne({ 
      where,
    });
    if (existe && !id_cliente) {
      return res
        .status(400)
        .json({ error: "Já existe um cliente cadastrado com este número de celular." });
    }

    // --- NOVO BLOCO: verifica mudança de status ---
    if (id_cliente && status) {
      // busca o registro original (sem respeitar paranoid para pegar mesmo soft-deleted, se quiser)
      const clienteAntigo = await models.Clientes.findByPk(id_cliente);
      if (clienteAntigo && clienteAntigo.status !== req.body.status) {
        // injeta timestamp atual
        req.body.tempo_status = new Date();
      }
    }else if(!id_cliente){
      // se for novo cliente, injeta timestamp atual
      req.body.tempo_status = new Date();
    }
    // -------------------------------------------------

    req.body.enterprise_id = enterpriseId;

    // segue para o upsert
    return _upsert(req, res);

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

// Lista clientes com filtros, ordenação e paginação + meta
exports.getClientes = async (req, res) => {
  try {
    const { search, status, cidade, sortBy, id_usuario } = req.query;
    const where = {};

    // paranoia já filtra deleted_at, mas mantemos explícito
    where.deleted_at = null;
    if (req.user.role !== 'moderator') {
      where.enterprise_id = req.enterprise.id;
    }

    if (id_usuario && id_usuario != "null") where.id_usuario = id_usuario;

    // Filtro por status
    if (status && status !== "todos") {
      where.status = { [models.Sequelize.Op.iLike]: status }; // case insensitive
    }

    // Filtro por cidade
    if (cidade && cidade !== "todas") {
      where.cidade = { [models.Sequelize.Op.iLike]: cidade };
    }

    // Busca geral (acentos-insensível para textos, símbolos-insensível para celular)
    if (search) {
      // normaliza texto: remove acentos e deixa minúsculo
      const normalized = String(search)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

      // extrai apenas dígitos para busca no celular
      const onlyDigits = String(search).replace(/\D/g, '');

      const orConds = [];

      // nome: unaccent + lower LIKE %normalized%
      orConds.push(
        Sequelize.where(
          Sequelize.fn('lower', Sequelize.fn('unaccent', Sequelize.col('nome'))),
          { [Op.like]: `%${normalized}%` }
        )
      );

      // campanha: se existir, aplica mesma lógica de texto
      orConds.push(
        Sequelize.where(
          Sequelize.fn('lower', Sequelize.fn('unaccent', Sequelize.col('campanha'))),
          { [Op.like]: `%${normalized}%` }
        )
      );

      // status: texto normalizado
      orConds.push(
        Sequelize.where(
          Sequelize.fn('lower', Sequelize.fn('unaccent', Sequelize.col('status'))),
          { [Op.like]: `%${normalized}%` }
        )
      );

      // cidade: texto normalizado
      orConds.push(
        Sequelize.where(
          Sequelize.fn('lower', Sequelize.fn('unaccent', Sequelize.col('cidade'))),
          { [Op.like]: `%${normalized}%` }
        )
      );

      // celular: remove símbolos no banco e faz LIKE com apenas dígitos
      if (onlyDigits) {
        orConds.push(
          Sequelize.where(
            Sequelize.fn('regexp_replace', Sequelize.col('celular'), '[^0-9]', '', 'g'),
            { [Op.like]: `%${onlyDigits}%` }
          )
        );
      } else {
        // fallback para caso o usuário digite algo não numérico mas queira achar por celular também
        orConds.push({ celular: { [Op.iLike]: `%${search}%` } });
      }

      where[Op.or] = orConds;
    }

    // Ordenação
    let order = [['updated_at', 'DESC']];
    if (sortBy === 'antigo') order = [['updated_at', 'ASC']];
    if (sortBy === 'nome') order = [['nome', 'ASC']];
    if (sortBy === 'id') order = [['id_cliente', 'ASC']];

    // Paginação
    let page = Math.max(1, parseInt(req.query.page, 10) || 1);
    let perPage = parseInt(req.query.perPage, 10) || 50; // default 50, antes era limit fixo 50
    if (Number.isNaN(perPage) || perPage < 1) perPage = 50;
    perPage = Math.min(perPage, 200);
    let offset = (page - 1) * perPage;

    let result = await models.Clientes.findAndCountAll({
      where,
      order,
      include: [{
        model: models.User,
        as: 'responsavel',
        attributes: ['name', 'id_usuario'],
        required: false,
      }],
      limit: perPage,
      offset,
      distinct: true,
    });

    let total = result.count;
    const limiteTotalRaw = parseInt(req.query.limiteTotal, 10);
    const hasLimiteTotal = !Number.isNaN(limiteTotalRaw) && limiteTotalRaw > 0;
    const effectiveTotal = hasLimiteTotal ? Math.min(total, limiteTotalRaw) : total;
    let totalPages = Math.max(1, Math.ceil(effectiveTotal / perPage));

    if (page > totalPages) {
      page = totalPages;
      offset = (page - 1) * perPage;
      result = await models.Clientes.findAndCountAll({
        where,
        order,
        include: [{
          model: models.User,
          as: 'responsavel',
          attributes: ['name', 'id_usuario'],
          required: false,
        }],
        limit: perPage,
        offset,
        distinct: true,
      });
    }

    let rows = result.rows;
    if (hasLimiteTotal && page === totalPages) {
      const already = perPage * (totalPages - 1);
      const remaining = Math.max(0, effectiveTotal - already);
      if (remaining < rows.length) rows = rows.slice(0, remaining);
    }

    return res.json({
      data: rows,
      meta: {
        total: effectiveTotal,
        page,
        perPage,
        totalPages,
      }
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};

// Remove um cliente pelo ID utilizando soft delete
exports.deleteCliente = async (req, res) => {
    try {
        const { id } = req.params;

        const cliente = await models.Clientes.findByPk(id);
        if (!cliente) {
            return res.status(404).json({ error: "Cliente não encontrado" });
        }
        if (req.user.role !== 'moderator' && cliente.enterprise_id !== req.enterprise.id) {
            return res.status(403).json({ error: 'Acesso negado' });
        }

        await cliente.destroy();
        res.json({ message: "Cliente deletado com sucesso (soft delete)" });
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: error.message });
    }
};

// Retorna listas de status e cidades disponíveis para filtros
exports.getFiltros = async (req, res) => {
  try {
    const whereBase = req.user.role === 'moderator' ? {} : { enterprise_id: req.enterprise.id };
    const statusData = await models.Clientes.aggregate('status', 'DISTINCT', { plain: false, where: whereBase });
    const cidadesData = await models.Clientes.aggregate('cidade', 'DISTINCT', { plain: false, where: whereBase });

    // monta os arrays
    const status = statusData.map(s => s.DISTINCT).filter(Boolean);
    const cidades = cidadesData.map(c => c.DISTINCT).filter(Boolean);


    // ordena alfabeticamente (pt-BR, case-insensitive)
    status.sort((a, b) =>
      a.localeCompare(b, 'pt', { sensitivity: 'base' })
    );
    cidades.sort((a, b) =>
      a.localeCompare(b, 'pt', { sensitivity: 'base' })
    );

    return res.status(200).json({ status, cidades });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
};

// ===== Eventos de Usuarios x Clientes =====

// POST /eventos  -> cria/marca evento (ou revive se já existia soft-deleted)
exports.postEvento = async (req, res) => {
  try {
    const { id_usuario, id_cliente, data, confirmado, evento } = req.body;
    if (!id_usuario || !id_cliente || !data) {
      return res.status(400).json({ error: 'id_usuario, id_cliente e data são obrigatórios.' });
    }

    const cliente = await models.Clientes.findByPk(id_cliente);
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    if (req.user.role !== 'moderator' && cliente.enterprise_id !== req.enterprise.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const quando = new Date(data);
    if (isNaN(quando.getTime())) return res.status(400).json({ error: 'Data inválida.' });

    // só bloqueia se JÁ existir um PENDENTE para o mesmo trio
    const pendente = await models.EventosUsuarioCliente.findOne({
      where: { id_usuario, id_cliente, data: quando, deleted_at: null, confirmado: null }
    });
    if (pendente) {
      return res.status(409).json({ message: 'Já existe um evento pendente para esse cliente e data.' });
    }

    const payload = { id_usuario, id_cliente, data: quando, evento, confirmado: null};


    const eventoBanco = await models.EventosUsuarioCliente.create(payload);
    console.log(eventoBanco)
    const completo = await models.EventosUsuarioCliente.findByPk(eventoBanco.id_evento, {
      include: [
        { model: models.Clientes, as: 'cliente', attributes: ['id_cliente','nome','celular','cidade','status'] },
        { model: models.User, as: 'usuario', attributes: ['id_usuario','name'] }
      ]
    });

    return res.json(completo);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};


// GET /eventos?id_usuario=123[&confirmados=true]

exports.getEventosUsuario = async (req, res) => {
  try {
    const { id_usuario, hoje, tz = "America/Maceio", confirmados } = req.query;
    if (!id_usuario) {
      return res.status(400).json({ error: "id_usuario é obrigatório." });
    }

    const isHoje = String(hoje).toLowerCase() === "true";

    const where = {
      id_usuario,
      deleted_at: null,
    };

    // filtro opcional por confirmação (mantém compat com seu uso anterior)
    if (typeof confirmados !== "undefined") {
      const wantConfirmados = String(confirmados).toLowerCase() === "true";
      where.confirmado = wantConfirmados ? { [Op.not]: null } : null;
    } else if (isHoje) {
      // comportamento anterior: pendentes até o fim do dia
      where.confirmado = null;
    }

    // filtro “hoje” respeitando fuso, armazenando UTC no banco
    if (isHoje) {
      const startUtc = moment.tz(tz).startOf("day").utc().toDate();
      const endUtc   = moment.tz(tz).endOf("day").utc().toDate();
      where.data = { [Op.between]: [startUtc, endUtc] };
    }

    
    const eventos = await models.EventosUsuarioCliente.findAll({
      where,
      order: [["data", "ASC"]],
      include: [
        {
          model: models.Clientes,
          as: "cliente",
          attributes: ["id_cliente", "nome", "celular", "cidade", "status"],
          where: req.user.role !== 'moderator' ? { enterprise_id: req.enterprise.id } : undefined,
        },
      ],
    });

    // devolve também a data formatada no fuso solicitado
    const resposta = eventos.map((e) => {
      const json = e.toJSON();
      json.dataLocal = moment.utc(json.data).tz(tz).format("DD/MM/YYYY HH:mm");
      return json;
    });

    return res.json(resposta);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

// DELETE /eventos/:id -> soft delete (confirmado=false e marca deleted_at)
exports.deleteEvento = async (req, res) => {
  try {
    const { id } = req.params;

    const evento = await models.EventosUsuarioCliente.findByPk(id);
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado.' });
    }
    const cliente = await models.Clientes.findByPk(evento.id_cliente);
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    if (req.user.role !== 'moderator' && cliente.enterprise_id !== req.enterprise.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    await evento.update({
      confirmado: false,
      deleted_at: new Date()
    });

    return res.json({ message: 'Evento cancelado e marcado como deletado (soft delete).' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

// Confirma um evento previamente registrado
exports.confirmarEvento = async (req, res) => {
  try {
    const { id } = req.params;

    const evento = await models.EventosUsuarioCliente.findByPk(id);
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado.' });
    }
    const cliente = await models.Clientes.findByPk(evento.id_cliente);
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    if (req.user.role !== 'moderator' && cliente.enterprise_id !== req.enterprise.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const atualizado = await evento.update({
      confirmado: true,
      deleted_at: null
    });

    return res.json(atualizado);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

// PATCH /eventos/:id/cancelar -> deixa confirmado=false sem deletar
exports.cancelarEvento = async (req, res) => {
  try {
    const { id } = req.params;

    const evento = await models.EventosUsuarioCliente.findByPk(id);
    if (!evento) {
      return res.status(404).json({ error: 'Evento não encontrado.' });
    }
    const cliente = await models.Clientes.findByPk(evento.id_cliente);
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    if (req.user.role !== 'moderator' && cliente.enterprise_id !== req.enterprise.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const atualizado = await evento.update({
      confirmado: false
    });

    return res.json(atualizado);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};


// Ajuda Dashboard
// usa moment-timezone e a sua constante TZ já existente
function bounds(periodo = 'hoje') {
  const now = moment.tz(TZ);
  const startToday = now.clone().startOf('day');
  const endToday   = now.clone().endOf('day');

  const parseLocal = (d) => {
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return moment.tz(d, 'YYYY-MM-DD', TZ);
    }
    return moment.tz(d, TZ);
  };

  // Range custom: ['YYYY-MM-DD','YYYY-MM-DD']
  if (Array.isArray(periodo)) {
    const [ini, fim] = periodo;
    const s = parseLocal(ini);
    const e = parseLocal(fim);

    if (!s.isValid() || !e.isValid()) {
      throw new RangeError('Datas inválidas. Use YYYY-MM-DD.');
    }

    const start = s.clone().startOf('day');
    const end   = e.clone().endOf('day');

    if (end.isBefore(start)) {
      throw new RangeError('Data final não pode ser antes da inicial.');
    }
    // máx 12 meses (inclusivo)
    if (end.isAfter(start.clone().add(12, 'months').endOf('day'))) {
      throw new RangeError('Intervalo máximo é de 12 meses.');
    }

    return { start: start.toDate(), end: end.toDate() };
  }

  // Presets
  switch ((periodo || 'hoje').toLowerCase()) {
    case 'semana': {
      // Semana atual (ISO): de segunda 00:00 até hoje 23:59:59
      const start = now.clone().startOf('isoWeek');
      return { start: start.toDate(), end: endToday.toDate() };
    }
    case 'mes':
    case 'mês': {
      // Mês atual: do dia 1º 00:00 até hoje 23:59:59
      const start = now.clone().startOf('month');
      return { start: start.toDate(), end: endToday.toDate() };
    }
    case 'hoje':
      return { start: startToday.toDate(), end: endToday.toDate() };
    default:
      throw new RangeError('Período inválido. Use "hoje", "semana", "mes" ou [ini,fim].');
  }
}

// Consolida dados estatísticos para o dashboard
exports.getDashboard = async (req, res) => {
  try {
    const { periodo = 'hoje' } = req.body;
    const { start, end } = bounds(periodo);

    // Filtros comuns
    const onlyAlive = req.user.role === 'moderator' ? { deleted_at: null } : { deleted_at: null, enterprise_id: req.enterprise.id };

    const [
      clientesNovos,
      clientesAtendidos,
      totalClientes,
      clientesPendentes,
      orcamentosEnviados,
      statusRaw,
      campanhaRaw,
      eventosMarcados,
      clientesFechados,
      contatosPorDiaRaw,
      ligacoesEfetuadasRaw,
      ligacoesPorDiaRaw
    ] = await Promise.all([
      // Clientes novos no período
      models.Clientes.count({
        where: {
          ...onlyAlive,
          created_at: { [Op.between]: [start, end] },
        },
      }),

      // Clientes atendidos no período (pelo campo ultimo_contato)
      models.Clientes.count({
        where: {
          ...onlyAlive,
          ultimo_contato: { [Op.between]: [start, end] },
        },
      }),

      // Total cadastrados
      models.Clientes.count({ where: { ...onlyAlive } }),

      // Pendentes (status = 'Aguardando')
      models.Clientes.count({
        where: { ...onlyAlive, status: 'Aguardando' },
      }),

      // Orçamentos enviados (boolean)
      models.Clientes.count({
        where: { ...onlyAlive, orcamento_enviado: true },
      }),

      // Distribuição por status (group by status)
      models.Clientes.findAll({
        attributes: [
          'status',
          [Sequelize.fn('COUNT', Sequelize.col('id_cliente')), 'count'],
        ],
        where: { ...onlyAlive, updated_at: { [Op.between]: [start, end] } },
        group: ['status'],
        order: [[Sequelize.literal('count'), 'DESC']],
        raw: true,
      }),

      // Distribuição por campanha (group by campanha)
      models.Clientes.findAll({
        attributes: [
          [models.sequelize.literal(`COALESCE(campanha, 'Sem Campanha')`), 'campanha'],
          [models.sequelize.fn('COUNT', models.sequelize.col('id_cliente')), 'count'],
        ],
        where: { ...onlyAlive, updated_at: { [Op.between]: [start, end] } },
        group: [models.sequelize.literal(`COALESCE(campanha, 'Sem Campanha')`)],
        order: [[models.sequelize.literal('count'), 'DESC']],
        raw: true,
      }),

      // Eventos marcados no período
      models.EventosUsuarioCliente.count({
        where: {
          data: { [Op.between]: [start, end] },
          deleted_at: null,
        },
        include: req.user.role === 'moderator' ? undefined : [{ model: models.Clientes, as: 'cliente', where: { enterprise_id: req.enterprise.id } }]
      }),

      // Clientes fechados no período
      models.Clientes.count({
        where: {
          ...onlyAlive,
          fechado: { [Op.between]: [start, end] },
        },
      }),

      // NOVO: Contatos por dia (group by DATE_TRUNC('day', ultimo_contato))
      (() => {
        const qi = models.sequelize.getQueryInterface();
        const ultimoField = models.Clientes.rawAttributes.ultimo_contato?.field || 'ultimo_contato';
        const idField     = models.Clientes.rawAttributes.id_cliente?.field || 'id_cliente';

        const qUlt = qi.quoteIdentifier(ultimoField);
        const qId  = qi.quoteIdentifier(idField);

        // Se col for timestamptz, isso já converte para hora local (timestamp sem tz)
        const dayExpr = `DATE((${qUlt} AT TIME ZONE '${TZ}'))`;

        return models.Clientes.findAll({
          attributes: [
            [Sequelize.literal(dayExpr), 'dia'],
            [Sequelize.literal(`COUNT(${qId})`), 'count'],
          ],
          where: {
            ...onlyAlive,
            ultimo_contato: { [Op.between]: [start, end] },
          },
          group: [Sequelize.literal(dayExpr)],
          order: [Sequelize.literal(`${dayExpr} ASC`)],
          raw: true,
        });
      })(),

      // NOVO: Total de ligações efetuadas no período
      (() => {
        const where = { deleted_at: null, data_hora: { [Op.between]: [start, end] } };
        const include = req.user.role === 'moderator' ? undefined : [
          { model: models.Clientes, as: 'cliente', where: { enterprise_id: req.enterprise.id }, attributes: [], required: true }
        ];
        return models.Ligacoes.count({ where, include });
      })(),

      // NOVO: Ligações por dia (group by data_hora na timezone)
      (() => {
        const qi = models.sequelize.getQueryInterface();
        const dhField = models.Ligacoes.rawAttributes.data_hora?.field || 'data_hora';
        const qDh = qi.quoteIdentifier(dhField);
        const dayExpr = `DATE((${qDh} AT TIME ZONE '${TZ}'))`;
        const where = { deleted_at: null, data_hora: { [Op.between]: [start, end] } };
        const include = req.user.role === 'moderator' ? undefined : [
          { model: models.Clientes, as: 'cliente', where: { enterprise_id: req.enterprise.id }, attributes: [], required: true }
        ];
        return models.Ligacoes.findAll({
          attributes: [
            [Sequelize.literal(dayExpr), 'dia'],
            [Sequelize.literal('COUNT(*)'), 'count'],
          ],
          where,
          include,
          group: [Sequelize.literal(dayExpr)],
          order: [Sequelize.literal(`${dayExpr} ASC`)],
          raw: true,
        });
      })()

    ]);

    // Normaliza rótulos
    const statusDistribution = statusRaw.map(({ status, count }) => ({
      status: status ?? 'Sem status',
      count: Number(count),
    }));
    const campanhaDistribution = campanhaRaw.map(({ campanha, count }) => ({
      campanha: campanha ?? 'Sem campanha',
      count: Number(count),
    }));

    // Preenche todos os dias do intervalo com zero quando não houver contato
    const startDay = moment.tz(start, TZ).startOf('day');
    const endDay = moment.tz(end, TZ).startOf('day');
    const byDayMap = new Map();
    for (const row of contatosPorDiaRaw) {
      // 'dia' vem como DATE (ex.: '2025-08-12'), garante o fuso
      const key = moment.tz(String(row.dia).slice(0, 10), 'YYYY-MM-DD', TZ).format('YYYY-MM-DD');
      byDayMap.set(key, Number(row.count) || 0);
    }
    const contatosPorDia = [];
    for (let m = startDay.clone(); m.diff(endDay, 'day') <= 0; m.add(1, 'day')) {
      const key = m.format('YYYY-MM-DD');
      contatosPorDia.push({ date: key, count: byDayMap.get(key) ?? 0 });
    }

    // Normaliza ligações por dia preenchendo zeros
    const ligByDayMap = new Map();
    for (const row of ligacoesPorDiaRaw) {
      const key = moment.tz(String(row.dia).slice(0, 10), 'YYYY-MM-DD', TZ).format('YYYY-MM-DD');
      ligByDayMap.set(key, Number(row.count) || 0);
    }
    const ligacoesPorDia = [];
    for (let m = startDay.clone(); m.diff(endDay, 'day') <= 0; m.add(1, 'day')) {
      const key = m.format('YYYY-MM-DD');
      ligacoesPorDia.push({ date: key, count: ligByDayMap.get(key) ?? 0 });
    }

    const preset = Array.isArray(periodo) ? 'custom' : String(periodo || 'hoje').toLowerCase();
    const periodoInfo = {
      inicio: moment.tz(start, TZ).format(),
      fim: moment.tz(end, TZ).format(),
      tz: TZ,
      preset,
    };

    const dashboardData = {
      clientesNovosHoje: clientesNovos,
      clientesAtendidosHoje: clientesAtendidos,
      totalClientesCadastrados: totalClientes,
      clientesPendentes,
      orcamentosEnviados,
      statusDistribution,
      campanhaDistribution,
      eventosMarcados,
      clientesFechados,
      contatosPorDia,
      ligacoesEfetuadas: Number(ligacoesEfetuadasRaw) || 0,
      ligacoesPorDia,
      periodo: periodoInfo,
    };

    return res.json({ success: true, data: dashboardData });
  } catch (err) {
    console.log(err);
    console.error('Erro no dashboard:', err);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
};


//
// 1) Listar clientes NOVOS no período (created_at)
// Campos: nome, updated_at, status, observacao
//
exports.listClientesNovos = async (req, res) => {
  try {
    const { periodo = 'hoje' } = req.body;
    const { start, end } = bounds(periodo);

    // paginação
    const page = Math.max(1, parseInt(req.body.page, 10) || 1);
    let perPage = parseInt(req.body.perPage, 10) || 20;
    if (Number.isNaN(perPage) || perPage < 1) perPage = 20;
    perPage = Math.min(perPage, 200);
    const offset = (page - 1) * perPage;

    const where = {
      deleted_at: null,
      created_at: { [Op.between]: [start, end] },
    };
    if (req.user.role !== 'moderator') {
      where.enterprise_id = req.enterprise.id;
    }
    const { count, rows } = await models.Clientes.findAndCountAll({
      attributes: ['nome', 'updated_at', 'status', 'observacao'],
      where,
      order: [['created_at', 'DESC'], ['id_cliente', 'DESC']],
      limit: perPage,
      offset,
      raw: true,
    });

    return res.json({
      success: true,
      meta: { total: count, page, perPage, totalPages: Math.ceil(count / perPage) },
      data: rows,
    });
  } catch (err) {
    console.error('listClientesNovos:', err);
    return res.status(500).json({ success: false, error: 'Erro interno' });
  }
};

//
// 2) Listar clientes ATENDIDOS no período (ultimo_contato)
// Campos: nome, updated_at, status, observacao
//
exports.listClientesAtendidos = async (req, res) => {
  try {
    const { periodo = 'hoje' } = req.body;
    const { start, end } = bounds(periodo);

    const page = Math.max(1, parseInt(req.body.page, 10) || 1);
    let perPage = parseInt(req.body.perPage, 10) || 20;
    if (Number.isNaN(perPage) || perPage < 1) perPage = 20;
    perPage = Math.min(perPage, 200);
    const offset = (page - 1) * perPage;

    const where = {
      deleted_at: null,
      ultimo_contato: { [Op.between]: [start, end] },
    };
    if (req.user.role !== 'moderator') {
      where.enterprise_id = req.enterprise.id;
    }
    const { count, rows } = await models.Clientes.findAndCountAll({
      attributes: ['nome', 'updated_at', 'status', 'observacao','ultimo_contato'],
      where,
      order: [['ultimo_contato', 'DESC'], ['id_cliente', 'DESC']],
      limit: perPage,
      offset,
      raw: true,
    });

    return res.json({
      success: true,
      meta: { total: count, page, perPage, totalPages: Math.ceil(count / perPage) },
      data: rows,
    });
  } catch (err) {
    console.error('listClientesAtendidos:', err);
    return res.status(500).json({ success: false, error: 'Erro interno' });
  }
};

//
// 3) Listar clientes FECHADOS no período (fechado)
// Campos: nome, updated_at, status, observacao
//
exports.listClientesFechados = async (req, res) => {
  try {
    const { periodo = 'hoje' } = req.body;
    const { start, end } = bounds(periodo);

    const page = Math.max(1, parseInt(req.body.page, 10) || 1);
    let perPage = parseInt(req.body.perPage, 10) || 20;
    if (Number.isNaN(perPage) || perPage < 1) perPage = 20;
    perPage = Math.min(perPage, 200);
    const offset = (page - 1) * perPage;

    const where = {
      deleted_at: null,
      fechado: { [Op.between]: [start, end] },
    };
    if (req.user.role !== 'moderator') {
      where.enterprise_id = req.enterprise.id;
    }
    const { count, rows } = await models.Clientes.findAndCountAll({
      attributes: ['nome', 'updated_at', 'status', 'observacao', 'fechado'],
      where,
      order: [['fechado', 'DESC'], ['id_cliente', 'DESC']],
      limit: perPage,
      offset,
      raw: true,
    });

    return res.json({
      success: true,
      meta: { total: count, page, perPage, totalPages: Math.ceil(count / perPage) },
      data: rows,
    });
  } catch (err) {
    console.error('listClientesFechados:', err);
    return res.status(500).json({ success: false, error: 'Erro interno' });
  }
};

//
// 4) Listar EVENTOS marcados no período (data)
// Campos: data, evento, confirmado, usuario.nome
//
exports.listEventosMarcados = async (req, res) => {
  try {
    const { periodo = 'hoje' } = req.body;
    const { start, end } = bounds(periodo);

    const page = Math.max(1, parseInt(req.body.page, 10) || 1);
    let perPage = parseInt(req.body.perPage, 10) || 20;
    if (Number.isNaN(perPage) || perPage < 1) perPage = 20;
    perPage = Math.min(perPage, 200);
    const offset = (page - 1) * perPage;

    const include = [
      { model: models.User, as: 'usuario', attributes: ['name'], required: false },
      { model: models.Clientes, as: 'cliente', attributes: ['nome'], required: false, where: req.user.role !== 'moderator' ? { enterprise_id: req.enterprise.id } : undefined }
    ];
    const { count, rows } = await models.EventosUsuarioCliente.findAndCountAll({
      attributes: ['data', 'evento', 'confirmado'],
      where: {
        deleted_at: null,
        data: { [Op.between]: [start, end] },
      },
      include,
      order: [['data', 'DESC'], ['id_evento', 'DESC']],
      limit: perPage,
      offset,
      distinct: true, // evita overcount devido ao include
    });

    // model instances -> json enxuto
    const data = rows.map(r => ({
      data: r.data,
      evento: r.evento,
      confirmado: r.confirmado,
      usuario: { name: r.usuario ? r.usuario.name : null },
      cliente: { nome: r.cliente ? r.cliente.nome : null }
    }));

    return res.json({
      success: true,
      meta: { total: count, page, perPage, totalPages: Math.ceil(count / perPage) },
      data,
    });
  } catch (err) {
    console.error('listEventosMarcados:', err);
    return res.status(500).json({ success: false, error: 'Erro interno' });
  }
};

// 5) Listar ligações efetuadas no período (data_hora)
// Campos: data_hora, atendida, observacao, usuario.name, cliente.nome
exports.listLigacoesEfetuadas = async (req, res) => {
  try {
    const { periodo = 'hoje' } = req.body;
    const { start, end } = bounds(periodo);

    const page = Math.max(1, parseInt(req.body.page, 10) || 1);
    let perPage = parseInt(req.body.perPage, 10) || 20;
    if (Number.isNaN(perPage) || perPage < 1) perPage = 20;
    perPage = Math.min(perPage, 200);
    const offset = (page - 1) * perPage;

    const include = [
      { model: models.User, as: 'usuario', attributes: ['name'], required: false },
      { model: models.Clientes, as: 'cliente', attributes: ['nome'], required: true, where: req.user.role !== 'moderator' ? { enterprise_id: req.enterprise.id } : undefined },
    ];

    const where = {
      deleted_at: null,
      data_hora: { [Op.between]: [start, end] },
    };

    const { rows, count } = await models.Ligacoes.findAndCountAll({
      attributes: ['id_ligacao', 'data_hora', 'atendida', 'observacao'],
      where,
      include,
      order: [['data_hora', 'DESC'], ['id_ligacao', 'DESC']],
      limit: perPage,
      offset,
      distinct: true,
    });

    const data = rows.map((r) => ({
      idLigacao: r.id_ligacao,
      data: r.data_hora,
      dataHora: r.data_hora,
      atendida: r.atendida,
      observacao: r.observacao,
      usuario: r.usuario ? { nomeCompleto: r.usuario.name } : null,
      cliente: r.cliente ? { nome: r.cliente.nome } : null,
    }));

    return res.json({
      success: true,
      meta: { total: count, page, perPage, totalPages: Math.ceil(count / perPage) },
      data,
    });
  } catch (err) {
    console.error('listLigacoesEfetuadas:', err);
    return res.status(500).json({ success: false, error: 'Erro interno' });
  }
};
