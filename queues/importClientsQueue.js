const { Queue } = require('bullmq');
const connection = require('../services/redis');

const importClientsQueue = new Queue('import-clients', { connection });

module.exports = importClientsQueue;
