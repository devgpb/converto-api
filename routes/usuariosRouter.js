const express = require('express');
const router = express.Router();
const UserController = require('../controllers/usuariosController')
const auth = require('../auth/auth-middleware')


// Rotas para CRUD de usuários
router.post('/', auth.verifyToken, UserController.createUser);
router.get('/', auth.verifyToken, UserController.getAllUsers);
router.get('/cargos', auth.verifyToken, UserController.getCargos);
router.get('/colaboradores', auth.verifyToken, UserController.getColaboradores);


router.get('/:id', auth.verifyToken, UserController.getUserById);
router.put('/:id', auth.verifyToken, UserController.updateUser);
router.delete('/:id', auth.verifyToken, UserController.deleteUser);

module.exports = router;
