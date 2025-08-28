const express = require('express');
const router = express.Router();
const UserController = require('../controllers/usuariosController')
const { authenticateToken, requireRole } = require('../middleware/auth')


// Rotas para CRUD de usuários
router.post('/', authenticateToken, requireRole(['admin']), UserController.createUser);
router.get('/', authenticateToken, UserController.getAllUsers);
router.get('/colaboradores', authenticateToken, UserController.getColaboradores);


router.get('/:id', authenticateToken, UserController.getUserById);
router.put('/:id', authenticateToken, UserController.updateUser);
router.patch('/:id/role', authenticateToken, requireRole(['admin']), UserController.updateUserRole);
router.delete('/:id', authenticateToken, UserController.deleteUser);

module.exports = router;
