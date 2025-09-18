const models = require('../models');
const moment = require('moment-timezone');

const { Sequelize } = models;
const { Op } = Sequelize;

const TZ = 'America/Maceio';

// Utilitário de período (mesma lógica do dashboard)
function bounds(periodo = 'hoje') {
  const now = moment.tz(TZ);
  const startToday = now.clone().startOf('day');
  const endToday = now.clone().endOf('day');

  const parseLocal = (d) => {
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return moment.tz(d, 'YYYY-MM-DD', TZ);
    }
    return moment.tz(d, TZ);
  };

  if (Array.isArray(periodo)) {
    const [ini, fim] = periodo;
    const s = parseLocal(ini);
    const e = parseLocal(fim);
    if (!s.isValid() || !e.isValid()) throw new RangeError('Datas inválidas. Use YYYY-MM-DD.');
    const start = s.clone().startOf('day');
    const end = e.clone().endOf('day');
    if (end.isBefore(start)) throw new RangeError('Data final não pode ser antes da inicial.');
    if (end.isAfter(start.clone().add(12, 'months').endOf('day'))) {
      throw new RangeError('Intervalo máximo é de 12 meses.');
    }
    return { start: start.toDate(), end: end.toDate() };
  }

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

// POST /api/relatorios/vendedor
// body: { id_usuario?: string, periodo?: 'hoje'|'semana'|'mes'|[ini,fim] }
exports.relatorioVendedor = async (req, res) => {
  try {
    const idUsuario = req.body.id_usuario || req.user?.id_usuario;
    const { periodo = 'hoje' } = req.body;
    if (!idUsuario) return res.status(400).json({ success: false, error: 'id_usuario é obrigatório' });

    // valida usuário alvo e escopo do tenant
    const usuario = await models.User.findByPk(idUsuario);
    if (!usuario) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    if (req.user?.role !== 'moderator' && usuario.tenant_id !== req.user?.tenant_id) {
      return res.status(403).json({ success: false, error: 'Acesso negado ao usuário' });
    }

    const { start, end } = bounds(periodo);

    // Filtros comuns
    const clientesBase = { deleted_at: null, id_usuario: idUsuario };
    if (req.user?.role !== 'moderator') clientesBase.enterprise_id = req.enterprise?.id;

    // include para ligarções respeitando escopo
    const includeLigacoes = [];
    if (req.user?.role !== 'moderator') {
      includeLigacoes.push({
        model: models.Clientes,
        as: 'cliente',
        where: { enterprise_id: req.enterprise?.id },
        attributes: [],
        required: true,
      });
    }

    // Expressões auxiliares
    const qi = models.sequelize.getQueryInterface();
    const dhField = models.Ligacoes.rawAttributes.data_hora?.field || 'data_hora';
    const qDh = qi.quoteIdentifier(dhField);
    const dayExprLig = `DATE((${qDh} AT TIME ZONE '${TZ}'))`;

    const ucField = models.Clientes.rawAttributes.ultimo_contato?.field || 'ultimo_contato';
    const qUc = qi.quoteIdentifier(ucField);
    const dayExprAtend = `DATE((${qUc} AT TIME ZONE '${TZ}'))`;

    const [
      totalClientesResponsavel,
      novosClientesPeriodo,
      atendidosPeriodo,
      orcamentosEnviadosPeriodo,
      vendasFechadasPeriodoRows,
      statusRaw,
      campanhaRaw,
      eventosPeriodo,
      eventosConfirmadosPeriodo,
      ligacoesTotal,
      ligacoesAtendidas,
      ligacoesPorDiaRaw,
      atendimentosPorDiaRaw,
      topClientesLigacoesRaw
    ] = await Promise.all([
      // Total de clientes sob responsabilidade do vendedor (escopo atual)
      models.Clientes.count({ where: { ...clientesBase } }),

      // Novos clientes no período
      models.Clientes.count({ where: { ...clientesBase, created_at: { [Op.between]: [start, end] } } }),

      // Clientes atendidos no período (ultimo_contato)
      models.Clientes.count({ where: { ...clientesBase, ultimo_contato: { [Op.between]: [start, end] } } }),

      // Orçamentos enviados no período (heurística: updated_at no período)
      models.Clientes.count({ where: { ...clientesBase, orcamento_enviado: true, updated_at: { [Op.between]: [start, end] } } }),

      // Vendas fechadas no período (traz linhas para calcular média de tempo)
      models.Clientes.findAll({
        attributes: ['id_cliente', 'created_at', 'fechado'],
        where: { ...clientesBase, fechado: { [Op.between]: [start, end] } },
        raw: true,
      }),

      // Distribuição por status (no período via updated_at)
      models.Clientes.findAll({
        attributes: [
          'status',
          [Sequelize.literal('COUNT(*)'), 'count'],
        ],
        where: { ...clientesBase, updated_at: { [Op.between]: [start, end] } },
        group: ['status'],
        order: [[Sequelize.literal('count'), 'DESC']],
        raw: true,
      }),

      // Distribuição por campanha (no período via created_at)
      models.Clientes.findAll({
        attributes: [
          'campanha',
          [Sequelize.literal('COUNT(*)'), 'count'],
        ],
        where: { ...clientesBase, created_at: { [Op.between]: [start, end] } },
        group: ['campanha'],
        order: [[Sequelize.literal('count'), 'DESC']],
        raw: true,
      }),

      // Eventos do vendedor no período
      models.EventosUsuarioCliente.count({
        where: { deleted_at: null, id_usuario: idUsuario, data: { [Op.between]: [start, end] } },
        include: (req.user?.role === 'moderator') ? undefined : [{
          model: models.Clientes,
          as: 'cliente',
          where: { enterprise_id: req.enterprise?.id },
          attributes: [],
          required: true,
        }],
      }),

      // Eventos confirmados do vendedor no período
      models.EventosUsuarioCliente.count({
        where: { deleted_at: null, id_usuario: idUsuario, confirmado: true, data: { [Op.between]: [start, end] } },
        include: (req.user?.role === 'moderator') ? undefined : [{
          model: models.Clientes,
          as: 'cliente',
          where: { enterprise_id: req.enterprise?.id },
          attributes: [],
          required: true,
        }],
      }),

      // Ligações totais do vendedor no período
      models.Ligacoes.count({
        where: { deleted_at: null, id_usuario: idUsuario, data_hora: { [Op.between]: [start, end] } },
        include: includeLigacoes.length ? includeLigacoes : undefined,
      }),

      // Ligações atendidas do vendedor no período
      models.Ligacoes.count({
        where: { deleted_at: null, id_usuario: idUsuario, atendida: true, data_hora: { [Op.between]: [start, end] } },
        include: includeLigacoes.length ? includeLigacoes : undefined,
      }),

      // Ligações por dia (série)
      models.Ligacoes.findAll({
        attributes: [
          [Sequelize.literal(dayExprLig), 'dia'],
          [Sequelize.literal('COUNT(*)'), 'count'],
        ],
        where: { deleted_at: null, id_usuario: idUsuario, data_hora: { [Op.between]: [start, end] } },
        include: includeLigacoes.length ? includeLigacoes : undefined,
        group: [Sequelize.literal(dayExprLig)],
        order: [Sequelize.literal(`${dayExprLig} ASC`)],
        raw: true,
      }),

      // Atendimentos por dia (ultimo_contato)
      models.Clientes.findAll({
        attributes: [
          [Sequelize.literal(dayExprAtend), 'dia'],
          [Sequelize.literal('COUNT(*)'), 'count'],
        ],
        where: { ...clientesBase, ultimo_contato: { [Op.between]: [start, end] } },
        group: [Sequelize.literal(dayExprAtend)],
        order: [Sequelize.literal(`${dayExprAtend} ASC`)],
        raw: true,
      }),

      // Top 5 clientes por ligações no período
      models.Ligacoes.findAll({
        attributes: [
          [Sequelize.col('Ligacoes.id_cliente'), 'id_cliente'],
          [Sequelize.literal('COUNT(*)'), 'count'],
        ],
        where: { deleted_at: null, id_usuario: idUsuario, data_hora: { [Op.between]: [start, end] } },
        include: [
          req.user?.role === 'moderator'
            ? { model: models.Clientes, as: 'cliente', attributes: ['nome'], required: true }
            : { model: models.Clientes, as: 'cliente', attributes: ['nome'], required: true, where: { enterprise_id: req.enterprise?.id } },
        ],
        group: [Sequelize.col('Ligacoes.id_cliente'), Sequelize.col('cliente.nome')],
        order: [[Sequelize.literal('count'), 'DESC']],
        limit: 5,
        raw: true,
      }),
    ]);

    // KPIs derivados
    const vendasFechadasPeriodo = Array.isArray(vendasFechadasPeriodoRows) ? vendasFechadasPeriodoRows.length : 0;
    let tempoMedioFechamentoDias = null;
    if (vendasFechadasPeriodo > 0) {
      const totalDias = vendasFechadasPeriodoRows.reduce((acc, r) => {
        const ini = moment(r.created_at);
        const fim = moment(r.fechado);
        const diff = Math.max(0, fim.diff(ini, 'days', true));
        return acc + diff;
      }, 0);
      tempoMedioFechamentoDias = Number((totalDias / vendasFechadasPeriodo).toFixed(2));
    }

    const taxaConversaoPeriodo = novosClientesPeriodo > 0
      ? Number(((vendasFechadasPeriodo / novosClientesPeriodo) * 100).toFixed(2))
      : 0;

    const statusDistribution = statusRaw.map(({ status, count }) => ({
      status: status ?? 'Sem status',
      count: Number(count),
    }));
    const campanhaDistribution = campanhaRaw.map(({ campanha, count }) => ({
      campanha: campanha ?? 'Sem campanha',
      count: Number(count),
    }));

    // Séries por dia com preenchimento zero
    const startDay = moment.tz(start, TZ).startOf('day');
    const endDay = moment.tz(end, TZ).startOf('day');

    const mapSerie = (raw) => {
      const m = new Map();
      for (const row of raw) {
        const key = moment.tz(String(row.dia).slice(0, 10), 'YYYY-MM-DD', TZ).format('YYYY-MM-DD');
        m.set(key, Number(row.count) || 0);
      }
      const arr = [];
      for (let d = startDay.clone(); d.diff(endDay, 'day') <= 0; d.add(1, 'day')) {
        const key = d.format('YYYY-MM-DD');
        arr.push({ date: key, count: m.get(key) ?? 0 });
      }
      return arr;
    };

    const ligacoesPorDia = mapSerie(ligacoesPorDiaRaw);
    const atendimentosPorDia = mapSerie(atendimentosPorDiaRaw);

    const topClientesLigacoes = topClientesLigacoesRaw.map((r) => ({
      id_cliente: r.id_cliente,
      nome: r['cliente.nome'] || r.nome || null,
      count: Number(r.count) || 0,
    }));

    const relatorio = {
      periodo: { inicio: start, fim: end, tz: TZ },
      vendedor: { id_usuario: usuario.id_usuario, nome: usuario.name, role: usuario.role },
      clientes: {
        totalResponsavel: totalClientesResponsavel,
        novosPeriodo: novosClientesPeriodo,
        atendidosPeriodo,
        orcamentosEnviadosPeriodo,
        vendasFechadasPeriodo,
        tempoMedioFechamentoDias,
        taxaConversaoPeriodo,
        statusDistribution,
        campanhaDistribution,
        atendimentosPorDia,
      },
      ligacoes: {
        total: ligacoesTotal,
        atendidas: ligacoesAtendidas,
        naoAtendidas: Math.max(0, (Number(ligacoesTotal) || 0) - (Number(ligacoesAtendidas) || 0)),
        taxaAtendimento: (ligacoesTotal > 0) ? Number(((ligacoesAtendidas / ligacoesTotal) * 100).toFixed(2)) : 0,
        porDia: ligacoesPorDia,
        topClientes: topClientesLigacoes,
      },
      eventos: {
        total: eventosPeriodo,
        confirmados: eventosConfirmadosPeriodo,
        pendentes: Math.max(0, Number(eventosPeriodo) - Number(eventosConfirmadosPeriodo)),
      },
    };

    return res.json({ success: true, data: relatorio });
  } catch (err) {
    console.error('relatorioVendedor:', err);
    return res.status(500).json({ success: false, error: err.message || 'Erro interno' });
  }
};
