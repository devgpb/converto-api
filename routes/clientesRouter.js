
// pedidosRouter.js
const express = require('express');
const clientesController = require('../controllers/clientesController')
const eventosController = require('../controllers/eventosController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();



router.post('/', authenticateToken, clientesController.postClientes);
router.post('/eventos', authenticateToken, clientesController.postEvento);
router.get('/eventos', authenticateToken, clientesController.getEventosUsuario);
router.get('/eventos/intervalo', authenticateToken, eventosController.listarEventosIntervalo);
router.get('/eventos/lista/cliente', authenticateToken, eventosController.listarEventosDoCliente);

router.delete('/eventos/:id', authenticateToken, clientesController.deleteEvento);
router.post('/eventos/:id/confirmar', authenticateToken, clientesController.confirmarEvento);
router.post('/eventos/:id/cancelar', authenticateToken, clientesController.cancelarEvento);
router.post('/dashboard', authenticateToken, clientesController.getDashboard);
router.post('/dashboard/clientes-novos', authenticateToken, clientesController.listClientesNovos);
router.post('/dashboard/clientes-atendidos', authenticateToken, clientesController.listClientesAtendidos);
router.post('/dashboard/clientes-fechados', authenticateToken, clientesController.listClientesFechados);
router.post('/dashboard/eventos-marcados', authenticateToken, clientesController.listEventosMarcados);




router.get('/', authenticateToken, clientesController.getClientes);
router.get('/filtros', authenticateToken, clientesController.getFiltros);
router.delete('/:id', authenticateToken, clientesController.deleteCliente);
router.post('/bulk', authenticateToken, clientesController.postBulkClientes);


module.exports = router;
