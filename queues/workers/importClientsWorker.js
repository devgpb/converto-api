const { Worker } = require('bullmq');
const connection = require('../../services/redis');
const { importClientsFromCsv } = require('../../services/importClients');

const worker = new Worker('import-clients', async job => {
  const { filePath, enterpriseId, userId } = job.data;
  return await importClientsFromCsv(filePath, enterpriseId, userId);
}, { connection });

worker.on('failed', (job, err) => {
  try {
    console.error('[worker:import-clients] Job FAILED', {
      id: job?.id,
      name: job?.name,
      queue: job?.queueName,
      data: job?.data,
      message: err?.message,
      stack: err?.stack,
    });
  } catch (_) {
    console.error('[worker:import-clients] Job FAILED (log error)', err);
  }
});

worker.on('completed', (job, result) => {
  try {
    console.log('[worker:import-clients] Job COMPLETED', {
      id: job?.id,
      name: job?.name,
      queue: job?.queueName,
      resultSummary: result ? 'ok' : 'empty',
    });
  } catch (_) {}
});

module.exports = worker;
