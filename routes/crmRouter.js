const express = require('express');
const router = express.Router();
const crmController = require('../controllers/crmController');
const { authenticateToken } = require('../middleware/auth');


router.get('/contatos', authenticateToken, crmController.pesquisarNumero);
router.post('/cliente/primeiro-contato', authenticateToken, crmController.marcarPrimeiraMensagemDia);

module.exports = router;
