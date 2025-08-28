const importQueue = require('../queues/importClientsQueue');
const exportQueue = require('../queues/exportClientsQueue');

const queues = {
  import: importQueue,
  export: exportQueue,
};

exports.importClients = async (req, res) => {
  try {
    const job = await importQueue.add('import', req.body || {});
    res.json({ id: job.id });
  } catch (err) {
    console.error('importClients job error', err);
    res.status(500).json({ error: 'Erro ao adicionar job' });
  }
};

exports.exportClients = async (req, res) => {
  try {
    const job = await exportQueue.add('export', req.body || {});
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
