const moment = require('moment-timezone');
moment.locale('pt-br');
const models = require('../models');

const { Op } = models.Sequelize;

const DEFAULT_TZ = 'America/Maceio';
const MAX_RANGE_DAYS = 120; // evita consultas muito grandes sem degradar o uso diário

const parseLocalDate = (value, tz) => {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return moment.tz(value, 'YYYY-MM-DD', tz);
  }
  return moment.tz(value, tz);
};

const resolveRange = (inicio, fim, tz) => {
  const now = moment.tz(tz);
  const start = (parseLocalDate(inicio, tz) || now.clone().startOf('month')).startOf('day');
  let end;

  if (fim) {
    end = parseLocalDate(fim, tz);
  } else if (inicio) {
    end = start.clone().endOf('month');
  } else {
    end = now.clone().endOf('month');
  }

  if (!start.isValid()) throw new RangeError('Data inicial inválida');
  if (!end || !end.isValid()) throw new RangeError('Data final inválida');

  const endDay = end.clone().endOf('day');
  if (endDay.isBefore(start)) throw new RangeError('Data final não pode ser anterior à inicial');

  const diffDays = endDay.diff(start, 'days');
  if (diffDays > MAX_RANGE_DAYS) {
    throw new RangeError(`Intervalo máximo permitido é de ${MAX_RANGE_DAYS + 1} dias`);
  }

  return { start, end: endDay };
};

const normalizeStatus = (value) => {
  const normalized = String(value || 'todos').toLowerCase();
  if (['pendente', 'pendentes'].includes(normalized)) return 'pendente';
  if (['confirmado', 'confirmados'].includes(normalized)) return 'confirmado';
  if (['cancelado', 'cancelados'].includes(normalized)) return 'cancelado';
  return 'todos';
};

const buildDayBuckets = (start, end, events) => {
  const grouped = events.reduce((acc, evt) => {
    const key = evt.dayKey;
    if (!acc[key]) acc[key] = [];
    acc[key].push(evt);
    return acc;
  }, {});

  const days = [];
  const cursor = start.clone();
  while (cursor.isSameOrBefore(end, 'day')) {
    const key = cursor.format('YYYY-MM-DD');
    const eventsForDay = grouped[key] || [];
    days.push({
      date: key,
      label: cursor.format('DD/MM'),
      weekday: cursor.format('ddd'),
      startUtc: cursor.clone().startOf('day').utc().toISOString(),
      endUtc: cursor.clone().endOf('day').utc().toISOString(),
      events: eventsForDay.map(({ dayKey, ...rest }) => rest),
      total: eventsForDay.length,
    });
    cursor.add(1, 'day');
  }

  return days;
};

exports.getCalendario = async (req, res) => {
  try {
    const tz = String(req.query.tz || DEFAULT_TZ);
    if (!moment.tz.zone(tz)) {
      return res.status(400).json({ error: 'Fuso horário inválido' });
    }

    let range;
    try {
      range = resolveRange(req.query.inicio, req.query.fim, tz);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const statusFilter = normalizeStatus(req.query.status);
    const requestedUser = req.query.id_usuario ? String(req.query.id_usuario) : null;
    const wantsAllUsers = requestedUser && ['all', '*'].includes(requestedUser.toLowerCase());
    const authUserId = String(req.user.id_usuario);
    let targetUserId = authUserId;

    if (wantsAllUsers) {
      if (['admin', 'moderator'].includes(req.user.role)) {
        targetUserId = null;
      } else {
        return res.status(403).json({ error: 'Apenas administradores podem visualizar todos os usuários' });
      }
    } else if (requestedUser && requestedUser !== authUserId) {
      if (req.user.role === 'moderator') {
        targetUserId = requestedUser;
      } else if (req.user.role === 'admin') {
        const sameTenantUser = await models.User.count({
          where: { id_usuario: requestedUser, tenant_id: req.user.tenant_id },
        });
        if (!sameTenantUser) {
          return res.status(404).json({ error: 'Usuário não encontrado na sua empresa' });
        }
        targetUserId = requestedUser;
      } else {
        return res.status(403).json({ error: 'Apenas administradores podem consultar o calendário de outros usuários' });
      }
    }

    const idCliente = req.query.id_cliente ? String(req.query.id_cliente) : null;
    const isModerator = req.user.role === 'moderator';

    if (!isModerator && !req.enterprise) {
      return res.status(400).json({ error: 'Empresa não vinculada ao usuário autenticado' });
    }

    const where = {
      deleted_at: null,
      data: {
        [Op.between]: [range.start.clone().utc().toDate(), range.end.clone().utc().toDate()],
      },
    };

    if (targetUserId) {
      where.id_usuario = targetUserId;
    }
    if (idCliente) {
      where.id_cliente = idCliente;
    }

    if (statusFilter === 'pendente') {
      where.confirmado = null;
    } else if (statusFilter === 'confirmado') {
      where.confirmado = true;
    } else if (statusFilter === 'cancelado') {
      where.confirmado = false;
    }

    const includeCliente = {
      model: models.Clientes,
      as: 'cliente',
      attributes: ['id_cliente', 'nome', 'celular', 'cidade', 'status'],
      required: !isModerator,
      where: !isModerator ? { enterprise_id: req.enterprise.id } : undefined,
      include: [
        { model: models.ClienteStatus, as: 'statusRef', attributes: ['nome'], required: false },
        { model: models.ClienteCampanha, as: 'campanhaRef', attributes: ['nome'], required: false },
      ],
    };

    const includeUsuario = {
      model: models.User,
      as: 'usuario',
      attributes: ['id_usuario', 'name'],
      required: false,
    };

    const eventos = await models.EventosUsuarioCliente.findAll({
      attributes: ['id_evento', 'id_usuario', 'id_cliente', 'data', 'evento', 'confirmado', 'created_at', 'updated_at'],
      where,
      include: [includeUsuario, includeCliente],
      order: [['data', 'ASC'], ['id_evento', 'ASC']],
    });

    const eventosPorDia = eventos.map((evt) => {
      const json = evt.toJSON();
      const dataLocal = moment.utc(json.data).tz(tz);
      const clienteRef = json.cliente || null;

      return {
        id_evento: json.id_evento,
        id_usuario: json.id_usuario,
        id_cliente: json.id_cliente,
        evento: json.evento || null,
        confirmado: json.confirmado,
        data_utc: moment.utc(json.data).toISOString(),
        data_local: dataLocal.format(),
        hora_local: dataLocal.format('HH:mm'),
        dia_local: dataLocal.format('YYYY-MM-DD'),
        cliente: clienteRef
          ? {
              id_cliente: clienteRef.id_cliente,
              nome: clienteRef.nome,
              celular: clienteRef.celular,
              cidade: clienteRef.cidade,
              status: clienteRef.statusRef?.nome ?? null,
              campanha: clienteRef.campanhaRef?.nome ?? null,
            }
          : null,
        usuario: json.usuario
          ? { id_usuario: json.usuario.id_usuario, nome: json.usuario.name }
          : null,
        dayKey: dataLocal.format('YYYY-MM-DD'),
      };
    });

    const days = buildDayBuckets(range.start, range.end, eventosPorDia);

    return res.json({
      range: {
        inicio_local: range.start.format(),
        fim_local: range.end.format(),
        inicio_utc: range.start.clone().utc().toISOString(),
        fim_utc: range.end.clone().utc().toISOString(),
        timezone: tz,
        dias: days.length,
      },
      filters: {
        id_usuario: targetUserId || (wantsAllUsers ? 'all' : authUserId),
        id_cliente: idCliente,
        status: statusFilter,
      },
      totals: {
        eventos: eventos.length,
      },
      days,
    });
  } catch (error) {
    console.error('Erro ao montar calendário:', error);
    return res.status(500).json({ error: 'Erro interno ao gerar calendário' });
  }
};
