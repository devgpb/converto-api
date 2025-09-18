// pedidosRouter.js
const express = require('express');
const clientesController = require('../controllers/clientesController');
const eventosController = require('../controllers/eventosController');
const { authenticateToken } = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscription');

const router = express.Router();


router.post('/', authenticateToken, requireActiveSubscription, clientesController.postClientes);
// Eventos (rotas existentes)
router.post('/eventos', authenticateToken, requireActiveSubscription, clientesController.postEvento);
router.get('/eventos', authenticateToken, requireActiveSubscription, clientesController.getEventosUsuario);
router.get('/eventos/intervalo', authenticateToken, requireActiveSubscription, eventosController.listarEventosIntervalo);
router.get('/eventos/lista/cliente', authenticateToken, requireActiveSubscription, eventosController.listarEventosDoCliente);

// Eventos aninhados por cliente
// GET /api/clientes/:id_cliente/eventos?inicio=&fim=&tz=
router.get('/:id_cliente/eventos', authenticateToken, requireActiveSubscription, (req, res, next) => {
  // encaminha para o controller reutilizando a query atual
  req.query = { ...req.query, id_cliente: req.params.id_cliente };
  return eventosController.listarEventosDoCliente(req, res, next);
});

// POST /api/clientes/:id_cliente/eventos
router.post('/:id_cliente/eventos', authenticateToken, requireActiveSubscription, (req, res, next) => {
  // Preenche automaticamente id_cliente e id_usuario quando não informados
  req.body = { id_usuario: req.user?.id_usuario, ...req.body, id_cliente: req.params.id_cliente };
  return clientesController.postEvento(req, res, next);
});

router.delete('/eventos/:id', authenticateToken, requireActiveSubscription, clientesController.deleteEvento);
router.post('/eventos/:id/confirmar', authenticateToken, requireActiveSubscription, clientesController.confirmarEvento);
router.post('/eventos/:id/cancelar', authenticateToken, requireActiveSubscription, clientesController.cancelarEvento);

// Dashboard disponível sem sub
router.post('/dashboard', authenticateToken, clientesController.getDashboard);
router.post('/dashboard/clientes-novos', authenticateToken, clientesController.listClientesNovos);
router.post('/dashboard/clientes-atendidos', authenticateToken, clientesController.listClientesAtendidos);
router.post('/dashboard/clientes-fechados', authenticateToken, clientesController.listClientesFechados);
router.post('/dashboard/eventos-marcados', authenticateToken, clientesController.listEventosMarcados);
router.post('/dashboard/ligacoes-efetuadas', authenticateToken, clientesController.listLigacoesEfetuadas);

router.get('/', authenticateToken, requireActiveSubscription, clientesController.getClientes);
router.get('/filtros', authenticateToken, requireActiveSubscription, clientesController.getFiltros);
router.delete('/:id', authenticateToken, requireActiveSubscription, clientesController.deleteCliente);

module.exports = router;
