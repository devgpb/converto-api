const { Worker } = require('bullmq');
const connection = require('../../services/redis');
const { importClientsFromCsv } = require('../../services/importClients');

module.exports = new Worker('import-clients', async job => {
  const { filePath, enterpriseId } = job.data;
  return await importClientsFromCsv(filePath, enterpriseId);
}, { connection });
