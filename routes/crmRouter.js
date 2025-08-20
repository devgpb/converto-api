const express = require('express');
const router = express.Router();
const crmController = require('../controllers/crmController');
const { authenticateToken } = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscription');


router.get('/contatos', authenticateToken, requireActiveSubscription, crmController.pesquisarNumero);
router.post('/cliente/primeiro-contato', authenticateToken, requireActiveSubscription, crmController.marcarPrimeiraMensagemDia);

module.exports = router;
