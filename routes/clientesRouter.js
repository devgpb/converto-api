
// pedidosRouter.js
const express = require('express');
const clientesController = require('../controllers/clientesController')
const eventosController = require('../controllers/eventosController');
const auth = require('../auth/auth-middleware');

const router = express.Router();



router.post('/', auth.verifyToken, clientesController.postClientes);
router.post('/eventos', auth.verifyToken, clientesController.postEvento);
router.get('/eventos', auth.verifyToken, clientesController.getEventosUsuario);
router.get('/eventos/intervalo', auth.verifyToken, eventosController.listarEventosIntervalo);
router.get('/eventos/lista/cliente', auth.verifyToken, eventosController.listarEventosDoCliente);

router.delete('/eventos/:id', auth.verifyToken, clientesController.deleteEvento);
router.post('/eventos/:id/confirmar', auth.verifyToken, clientesController.confirmarEvento);
router.post('/eventos/:id/cancelar', auth.verifyToken, clientesController.cancelarEvento);
router.post('/dashboard', auth.verifyToken, clientesController.getDashboard);
router.post('/dashboard/clientes-novos', auth.verifyToken, clientesController.listClientesNovos);
router.post('/dashboard/clientes-atendidos', auth.verifyToken, clientesController.listClientesAtendidos);
router.post('/dashboard/clientes-fechados', auth.verifyToken, clientesController.listClientesFechados);
router.post('/dashboard/eventos-marcados', auth.verifyToken, clientesController.listEventosMarcados);




router.get('/', auth.verifyToken, clientesController.getClientes);
router.get('/filtros', auth.verifyToken, clientesController.getFiltros);
router.delete('/:id', auth.verifyToken, clientesController.deleteCliente);
router.post('/bulk', auth.verifyToken, clientesController.postBulkClientes);


module.exports = router;
