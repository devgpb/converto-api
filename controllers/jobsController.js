const importQueue = require('../queues/importClientsQueue');
const exportQueue = require('../queues/exportClientsQueue');
const { cleanupExports, getEnvPrefix } = require('../services/cleanupExports');

const queues = {
  import: importQueue,
  export: exportQueue,
};


exports.importClients = async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'Arquivo CSV é obrigatório.' });
    }
    const csvFile = req.files.file;
    const filePath = csvFile.tempFilePath;
    const job = await importQueue.add('import', {
      filePath,
      enterpriseId: req.enterprise.id,
      userId: req.user.id_usuario,
    });
    res.json({ id: job.id });
  } catch (err) {
    console.error('importClients job error', err);
    res.status(500).json({ error: 'Erro ao adicionar job' });
  }
};

exports.exportClients = async (req, res) => {
  try {
    const { exportScope, targetUserId } = req.body || {};

    // Escopo padrão: exportar do próprio usuário
    const scope = exportScope === 'enterprise' ? 'enterprise' : 'user';

    // Apenas admin pode exportar todos os clientes da empresa
    if (scope === 'enterprise' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas admin pode exportar todos os clientes da empresa' });
    }

    // Se for escopo de usuário e foi passado outro userId, apenas admin pode
    let effectiveUserId = req.user.id_usuario;
    if (scope === 'user') {
      if (targetUserId && String(targetUserId) !== String(req.user.id_usuario)) {
        if (req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Apenas admin pode exportar clientes de outro usuário' });
        }
        effectiveUserId = String(targetUserId);
      }
    }

    const payload = {
      userId: req.user.id_usuario,           // quem requisitou
      requesterRole: req.user.role,
      exportScope: scope,                    // 'enterprise' | 'user'
      enterpriseId: req.enterprise?.id || null,
      targetUserId: scope === 'user' ? effectiveUserId : null,
    };

    const job = await exportQueue.add('export', payload);
    res.json({ id: job.id });
  } catch (err) {
    console.error('exportClients job error', err);
    res.status(500).json({ error: 'Erro ao adicionar job' });
  }
};

exports.getJobStatus = async (req, res) => {
  const { queue, id } = req.params;
  const q = queues[queue];
  if (!q) return res.status(404).json({ error: 'Fila não encontrada' });
  const job = await q.getJob(id);
  if (!job) return res.status(404).json({ error: 'Job não encontrado' });
  const state = await job.getState();
  res.json({
    id: job.id,
    state,
    progress: job.progress,
    data: job.data,
    result: job.returnvalue || null,
    failedReason: job.failedReason || null,
    attemptsMade: job.attemptsMade,
  });
};

exports.cancelJob = async (req, res) => {
  const { queue, id } = req.params;
  const q = queues[queue];
  if (!q) return res.status(404).json({ error: 'Fila não encontrada' });
  const job = await q.getJob(id);
  if (!job) return res.status(404).json({ error: 'Job não encontrado' });
  await job.remove();
  res.json({ success: true });
};

// Lista jobs do usuário autenticado (todas as filas) com paginação e busca
exports.listUserJobs = async (req, res) => {
  try {
    const targetUserId = (req.user.role === 'moderator' && req.query.userId)
      ? String(req.query.userId)
      : req.user.id_usuario;

    const states = (req.query.states ? String(req.query.states).split(',') : ['waiting', 'active', 'delayed', 'completed', 'failed'])
      .map(s => s.trim())
      .filter(Boolean);

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const perPage = Math.min(Math.max(parseInt(req.query.perPage, 10) || 10, 1), 100);
    const search = (req.query.search ? String(req.query.search).toLowerCase() : '').trim();

    // Para coletar resultados suficientes antes de paginar, buscamos até um limite razoável por estado
    const preLimit = Math.min(parseInt(req.query.limit, 10) || 500, 1000);

    const results = [];

    for (const [, q] of Object.entries(queues)) {
      const collected = [];
      for (const st of states) {
        try {
          // Busca um lote por estado; Bull aceita range (start, end)
          const jobs = await q.getJobs([st], 0, preLimit - 1);
          collected.push(...jobs);
        } catch (_) {
          // ignora estados não suportados
        }
      }

      for (const job of collected) {
        if (job?.data?.userId !== targetUserId) continue;
        const state = await job.getState();
        const base = {
          queue: q.name,
          id: job.id,
          name: job.name,
          state,
          progress: job.progress,
          data: (() => {
            const { filePath, ...rest } = job.data || {};
            return rest; // evita expor caminho do arquivo
          })(),
          failedReason: job.failedReason || null,
          returnvalue: job.returnvalue || null,
          timestamp: job.timestamp || null,
          requestedAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
          attemptsMade: job.attemptsMade || 0,
        };

        // Se for export e estiver concluído, expõe link e expiração de forma amigável
        if (job.name === 'export' && state === 'completed' && job.returnvalue) {
          const rv = job.returnvalue || {};
          base.exportLink = rv.signedUrl || null;
          base.exportExpiresAt = rv.expiresAt || null;
          base.storagePath = rv.path || null;
        }

        results.push(base);
      }
    }

    // Ordena do mais recente para o mais antigo
    results.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    // Filtro de busca (id, fila, estado, nome do job e alguns campos de data)
    const filtered = search
      ? results.filter((r) => {
          const haystack = [
            String(r.id || ''),
            String(r.queue || ''),
            String(r.state || ''),
            String(r.name || ''),
            r.requestedAt ? new Date(r.requestedAt).toLocaleString('pt-BR') : '',
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(search);
        })
      : results;

    const total = filtered.length;
    const totalPages = Math.max(Math.ceil(total / perPage), 1);
    const start = (page - 1) * perPage;
    const end = start + perPage;
    const pageItems = filtered.slice(start, end);

    res.json({
      data: pageItems,
      meta: { total, page, perPage, totalPages },
    });
  } catch (err) {
    console.error('listUserJobs error', err);
    res.status(500).json({ error: 'Erro ao listar jobs do usuário' });
  }
};

// Dispara a limpeza de exports (on-demand) – apenas moderator
exports.cleanupExportsNow = async (req, res) => {
  try {
    if (req?.user?.role !== 'moderator') {
      return res.status(403).json({ error: 'Apenas moderator pode disparar limpeza' });
    }

    const env = req.body?.env ? String(req.body.env) : undefined; // 'dev' | 'prod' opcional
    const dryRun = req.body?.dryRun === true;
    const ttlDays = req.body?.ttlDays ? parseInt(req.body.ttlDays, 10) : undefined;

    const summary = await cleanupExports({ env, ttlDays, dryRun });
    res.json({ ok: true, env: getEnvPrefix(env), summary });
  } catch (err) {
    console.error('cleanupExportsNow error', err);
    res.status(500).json({ error: 'Erro ao executar limpeza', details: err.message });
  }
};
