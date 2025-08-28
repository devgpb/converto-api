const { Worker } = require('bullmq');
const connection = require('../../services/redis');

module.exports = new Worker('export-clients', async job => {
  // TODO: implement export logic
  console.log(`Processing export job ${job.id}`, job.data);
}, { connection });
