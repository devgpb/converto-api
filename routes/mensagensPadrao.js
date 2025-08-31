// routes/mensagensPadraoRoutes.js
const express = require('express');
const router = express.Router();
const MensagensPadraoController = require('../controllers/mensagensPadraoController');
const { authenticateToken } = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscription');

// Rotas para CRUD de mensagens padrão
router.post('/', authenticateToken, requireActiveSubscription, MensagensPadraoController.criar);
router.get('/', authenticateToken, requireActiveSubscription, MensagensPadraoController.listar);
router.get('/:idMensagem', authenticateToken, requireActiveSubscription, MensagensPadraoController.obter);
router.put('/:idMensagem', authenticateToken, requireActiveSubscription, MensagensPadraoController.atualizar);
router.delete('/:idMensagem', authenticateToken, requireActiveSubscription, MensagensPadraoController.deletar);

module.exports = router;
