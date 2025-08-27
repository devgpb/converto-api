const express = require('express');
const router = express.Router();
const { 
  syncSeats, 
  getSeatUsage, 
  addSeat, 
  removeSeat 
} = require('../controllers/seatController');
const { validateSeatSync } = require('../middleware/validation');
const { authenticateToken, requireRole } = require('../middleware/auth');

// POST /api/seats/sync - Sincronizar assentos
router.post('/sync', authenticateToken, requireRole(['admin', 'moderator']), validateSeatSync, syncSeats);

// GET /api/seats/usage/:tenant_id - Buscar uso de assentos
router.get('/usage/:tenant_id', authenticateToken, getSeatUsage);

// POST /api/seats/add - Adicionar assento (ativar usuário)
router.post('/add', authenticateToken, requireRole(['admin', 'moderator']), addSeat);

// POST /api/seats/remove - Remover assento (desativar usuário)
router.post('/remove', authenticateToken, requireRole(['admin', 'moderator']), removeSeat);

module.exports = router;

