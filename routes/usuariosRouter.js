const express = require('express');
const router = express.Router();
const UserController = require('../controllers/usuariosController')
const { authenticateToken } = require('../middleware/auth')


// Rotas para CRUD de usuários
router.post('/', authenticateToken, UserController.createUser);
router.get('/', authenticateToken, UserController.getAllUsers);
router.get('/colaboradores', authenticateToken, UserController.getColaboradores);


router.get('/:id', authenticateToken, UserController.getUserById);
router.put('/:id', authenticateToken, UserController.updateUser);
router.delete('/:id', authenticateToken, UserController.deleteUser);

module.exports = router;
