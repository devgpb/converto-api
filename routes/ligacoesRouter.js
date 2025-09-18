const express = require('express');
const router = express.Router();
const ligacoesController = require('../controllers/ligacoesController');
const { authenticateToken } = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscription');

// Criar/atualizar ligação
router.post('/', authenticateToken, requireActiveSubscription, ligacoesController.postLigacao);

// Listar ligações feitas por um usuário
router.get('/', authenticateToken, requireActiveSubscription, ligacoesController.getLigacoesDoUsuario);

// Listar ligações de um cliente específico
router.get('/cliente/:id_cliente', authenticateToken, requireActiveSubscription, ligacoesController.getLigacoesDoCliente);

// Listagem de usuários para realizar ligações (seleção)
router.get('/usuarios', authenticateToken, requireActiveSubscription, ligacoesController.listarUsuariosParaLigacao);

module.exports = router;

