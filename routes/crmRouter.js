const express = require('express');
const router = express.Router();
const crmController = require('../controllers/crmController');
const auth = require('../auth/auth-middleware');


router.get('/contatos', auth.verifyToken,crmController.pesquisarNumero);
router.post('/cliente/primeiro-contato', auth.verifyToken,crmController.marcarPrimeiraMensagemDia);

module.exports = router;
