const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscription');
const controller = require('../controllers/camposClienteController');

const router = express.Router();

// Listagens (GET)
router.get('/status', authenticateToken, requireActiveSubscription, controller.listStatus);
router.get('/campanhas', authenticateToken, requireActiveSubscription, controller.listCampanhas);
router.get('/filtros', authenticateToken, requireActiveSubscription, controller.getFiltros);

// Criação (POST)
router.post('/status', authenticateToken, requireActiveSubscription, controller.createStatus);
router.post('/campanhas', authenticateToken, requireActiveSubscription, controller.createCampanha);

// Exclusão (DELETE)
router.delete('/status/:id', authenticateToken, requireActiveSubscription, controller.deleteStatus);
router.delete('/campanhas/:id', authenticateToken, requireActiveSubscription, controller.deleteCampanha);

// Ordenação (PATCH)
router.patch('/status/ordenacao', authenticateToken, requireActiveSubscription, controller.reorderStatus);

module.exports = router;
