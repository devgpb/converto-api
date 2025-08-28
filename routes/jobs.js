const express = require('express');
const router = express.Router();
const jobsController = require('../controllers/jobsController');

router.post('/import-clients', jobsController.importClients);
router.post('/export-clients', jobsController.exportClients);
router.get('/:queue/:id', jobsController.getJobStatus);
router.delete('/:queue/:id', jobsController.cancelJob);

module.exports = router;
