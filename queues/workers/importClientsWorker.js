const { Worker } = require('bullmq');
const connection = require('../../services/redis');

module.exports = new Worker('import-clients', async job => {
  // TODO: implement import logic
  console.log(`Processing import job ${job.id}`, job.data);
}, { connection });
