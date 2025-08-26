const models = require("../models");
const _upsert = require("../utils/rest").getDefaultUpsert(models.Clientes, "id_cliente");
const { Sequelize } = models
const { Op } = Sequelize;
const { formataTexto } = require('../utils/utils');
const csvParser  = require('csv-parser');
const fs  = require('fs');
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

    console.log("\n\n", enterpriseId)

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
      if(req.user.role !== 'admin' && cliente.enterprise_id !== enterpriseId){
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
    if(req.user.role !== 'admin'){
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

// Lista clientes com filtros de busca e ordenação
exports.getClientes = async (req, res) => {
    try {
        const { search, status, cidade, sortBy, id_usuario } = req.query;
        const where = {};

        where.deleted_at = null;
        if (req.user.role !== 'admin') {
            where.enterprise_id = req.enterprise.id;
        }

        if(id_usuario && id_usuario != "null")
            where.id_usuario = id_usuario;

        // Filtro por status
        if (status && status !== "todos") {
            where.status = { [models.Sequelize.Op.iLike]: status }; // case insensitive
        }

        // Filtro por cidade
        if (cidade && cidade !== "todas") {
            where.cidade = { [models.Sequelize.Op.iLike]: cidade };
        }

        // Busca geral
        if (search) {
            where[models.Sequelize.Op.or] = [
                { nome: { [models.Sequelize.Op.iLike]: `%${search}%` } },
                { celular: { [models.Sequelize.Op.iLike]: `%${search}%` } },
                { campanha: { [models.Sequelize.Op.iLike]: `%${search}%` } },
                { status: { [models.Sequelize.Op.iLike]: `%${search}%` } },
                { cidade: { [models.Sequelize.Op.iLike]: `%${search}%` } },
                { id_cliente: !isNaN(search) ? Number(search) : -1 }
            ];
        }

        let order = [['updated_at', 'DESC']];
        if (sortBy === 'antigo') order = [['updated_at', 'ASC']];
        if (sortBy === 'nome') order = [['nome', 'ASC']];
        if (sortBy === 'id') order = [['id_cliente', 'ASC']];

        const clientes = await models.Clientes.findAll({
            where,
            order,
            include: [{
                model: models.User,
                as: 'responsavel',
                attributes: ['name', 'id_usuario'],
            }],
            limit: 50 
        });

        res.json(clientes);
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
        if (req.user.role !== 'admin' && cliente.enterprise_id !== req.enterprise.id) {
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
    const whereBase = req.user.role === 'admin' ? {} : { enterprise_id: req.enterprise.id };
    const statusData = await models.Clientes.aggregate('status', 'DISTINCT', { plain: false, where: whereBase });
    const cidadesData = await models.Clientes.aggregate('cidade', 'DISTINCT', { plain: false, where: whereBase });

    // monta os arrays
    const status = statusData.map(s => s.DISTINCT).filter(Boolean);
    const cidades = cidadesData.map(c => c.DISTINCT).filter(Boolean);

    // adiciona "Visita Marcada" se não existir
    if (!status.includes('Visita Marcada')) {
      status.push('Visita Marcada');
    }

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

// Importa clientes em massa a partir de um arquivo CSV
exports.postBulkClientes = async (req, res) => {
  try {
    // 1) valida upload
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'Arquivo CSV é obrigatório.' });
    }
    const csvFile = req.files.file;
    const filePath = csvFile.tempFilePath; // veio do express-fileupload

    // 2) faz o parse do CSV em memória
    const linhas = await new Promise((resolve, reject) => {
      const resultados = [];
      fs.createReadStream(filePath)
        .pipe(csvParser({
          separator: ';',               // seu CSV é “;”
          mapHeaders: ({ header }) => header.trim()  // limpa espaços dos nomes
        }))
        .on('data', row => resultados.push(row))
        .on('end', () => resolve(resultados))
        .on('error', err => reject(err));
    });


    // 3) processa cada linha
    const resumo = { criados: 0, atualizados: 0, pulados: 0, erros: [] };
    for (let [i, row] of linhas.entries()) {
      const celular = row.celular?.trim();
      const nomeRaw = row.nome?.trim();
      if (!celular || !nomeRaw) {
        resumo.erros.push({ linha: i+1, motivo: 'Falta nome ou celular' });
        continue;
      }

      const dados = { celular, nome: formataTexto(nomeRaw), enterprise_id: req.enterprise.id };
      if (row.status)  dados.status  = formataTexto(row.status.trim());
      if (row.cidade)  dados.cidade  = formataTexto(row.cidade.trim());
      if (row.id_usuario)  dados.id_usuario  = row.id_usuario;
      if (row.indicacao)  dados.indicacao  = formataTexto(row.indicacao.trim());
      if (row.campanha)  dados.campanha  = formataTexto(row.campanha.trim());
      if (row.observacao)  dados.observacao  = formataTexto(row.observacao.trim());


      // upsert manual
      const existente = await models.Clientes.findOne({
        where: { celular, deleted_at: null, enterprise_id: req.enterprise.id }
      });

      if (existente) {
        await existente.update(dados);
        resumo.atualizados++;
      } else {
        await models.Clientes.create(dados);
        resumo.criados++;
      }
    }

    // 4) devolve o resumo
    return res.json(resumo);

  } catch (error) {
    console.error(error);
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
    if (req.user.role !== 'admin' && cliente.enterprise_id !== req.enterprise.id) {
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
          where: req.user.role !== 'admin' ? { enterprise_id: req.enterprise.id } : undefined,
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
    if (req.user.role !== 'admin' && cliente.enterprise_id !== req.enterprise.id) {
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
    if (req.user.role !== 'admin' && cliente.enterprise_id !== req.enterprise.id) {
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
    if (req.user.role !== 'admin' && cliente.enterprise_id !== req.enterprise.id) {
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
      const start = now.clone().subtract(7, 'days').startOf('day');
      return { start: start.toDate(), end: endToday.toDate() };
    }
    case 'mes': {
      const start = now.clone().subtract(30, 'days').startOf('day');
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
    const onlyAlive = req.user.role === 'admin' ? { deleted_at: null } : { deleted_at: null, enterprise_id: req.enterprise.id };

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
      contatosPorDiaRaw
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
        include: req.user.role === 'admin' ? undefined : [{ model: models.Clientes, as: 'cliente', where: { enterprise_id: req.enterprise.id } }]
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
    if (req.user.role !== 'admin') {
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
    if (req.user.role !== 'admin') {
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
    if (req.user.role !== 'admin') {
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
      { model: models.Clientes, as: 'cliente', attributes: ['nome'], required: false, where: req.user.role !== 'admin' ? { enterprise_id: req.enterprise.id } : undefined }
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