const express = require('express');
const router = express.Router();
const jobsController = require('../controllers/jobsController');
const { authenticateToken } = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscription');

router.post('/import-clients', authenticateToken, requireActiveSubscription, jobsController.importClients);
router.post('/export-clients', authenticateToken, requireActiveSubscription, jobsController.exportClients);
// Limpeza sob demanda (apenas admin) – independente de assinatura
router.post('/cleanup-exports', authenticateToken, jobsController.cleanupExportsNow);
// Listar jobs do usuário autenticado (deve vir antes de rotas com params)
router.get('/user', authenticateToken, jobsController.listUserJobs);
router.get('/:queue/:id', jobsController.getJobStatus);
router.delete('/:queue/:id', jobsController.cancelJob);

module.exports = router;
