
// pedidosRouter.js
const express = require('express');
const clientesController = require('../controllers/clientesController')
const eventosController = require('../controllers/eventosController');
const { authenticateToken } = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscription');

const router = express.Router();



router.post('/', authenticateToken, requireActiveSubscription, clientesController.postClientes);
router.post('/eventos', authenticateToken, requireActiveSubscription, clientesController.postEvento);
router.get('/eventos', authenticateToken, requireActiveSubscription, clientesController.getEventosUsuario);
router.get('/eventos/intervalo', authenticateToken, requireActiveSubscription, eventosController.listarEventosIntervalo);
router.get('/eventos/lista/cliente', authenticateToken, requireActiveSubscription, eventosController.listarEventosDoCliente);

router.delete('/eventos/:id', authenticateToken, requireActiveSubscription, clientesController.deleteEvento);
router.post('/eventos/:id/confirmar', authenticateToken, requireActiveSubscription, clientesController.confirmarEvento);
router.post('/eventos/:id/cancelar', authenticateToken, requireActiveSubscription, clientesController.cancelarEvento);

// Dashboard disponível sem sub
router.post('/dashboard', authenticateToken, clientesController.getDashboard);
router.post('/dashboard/clientes-novos', authenticateToken, clientesController.listClientesNovos);
router.post('/dashboard/clientes-atendidos', authenticateToken, clientesController.listClientesAtendidos);
router.post('/dashboard/clientes-fechados', authenticateToken, clientesController.listClientesFechados);
router.post('/dashboard/eventos-marcados', authenticateToken, clientesController.listEventosMarcados);




router.get('/', authenticateToken, requireActiveSubscription, clientesController.getClientes);
router.get('/filtros', authenticateToken, requireActiveSubscription, clientesController.getFiltros);
router.delete('/:id', authenticateToken, requireActiveSubscription, clientesController.deleteCliente);
router.post('/bulk', authenticateToken, requireActiveSubscription, clientesController.postBulkClientes);


module.exports = router;
