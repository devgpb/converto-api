const importQueue = require('../queues/importClientsQueue');
const exportQueue = require('../queues/exportClientsQueue');

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

// Lista jobs do usuário autenticado (todas as filas)
exports.listUserJobs = async (req, res) => {
  try {
    const targetUserId = (req.user.role === 'moderator' && req.query.userId) ? String(req.query.userId) : req.user.id_usuario;
    const states = (req.query.states ? String(req.query.states).split(',') : ['waiting', 'active', 'delayed', 'completed', 'failed'])
      .map(s => s.trim()).filter(Boolean);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);

    const results = [];

    for (const [alias, q] of Object.entries(queues)) {
      const collected = [];
      for (const st of states) {
        try {
          const jobs = await q.getJobs([st], 0, limit - 1);
          collected.push(...jobs);
        } catch (_) { /* ignora estados não suportados */ }
      }

      for (const job of collected) {
        if (job?.data?.userId !== targetUserId) continue;
        const state = await job.getState();
        results.push({
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
          attemptsMade: job.attemptsMade || 0,
        });
      }
    }

    // Ordena do mais recente para o mais antigo
    results.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    res.json({ count: results.length, jobs: results.slice(0, limit) });
  } catch (err) {
    console.error('listUserJobs error', err);
    res.status(500).json({ error: 'Erro ao listar jobs do usuário' });
  }
};
