const { Queue } = require('bullmq');
const connection = require('../services/redis');

const exportClientsQueue = new Queue('export-clients', { connection });

module.exports = exportClientsQueue;
