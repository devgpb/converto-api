const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const controller = require('../controllers/relatoriosController');

const router = express.Router();

// Disponível com autenticação (sem exigir assinatura, alinhado ao dashboard)
router.post('/vendedor', authenticateToken, controller.relatorioVendedor);

module.exports = router;

