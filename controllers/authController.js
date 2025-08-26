const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Tenant } = require('../models');

/**
 * Gera um token JWT para o usuário fornecido.
 * @param {Object} user - Instância do usuário autenticado.
 * @returns {string} Token JWT válido por 1 hora.
 */
const generateToken = (user) => {
  return jwt.sign({ userId: user.id_usuario }, process.env.JWT_SECRET, {
    expiresIn: '1h'
  });
};

/**
 * Registra um novo usuário vinculado a um tenant existente.
 * Valida campos obrigatórios, cria o usuário e retorna um token JWT.
 * O primeiro usuário de cada tenant recebe papel de administrador.
 */
const register = async (req, res) => {
  try {
    const { tenant_id, email, password, name } = req.body;

    if (!tenant_id || !email || !password || !name) {
      return res.status(400).json({ error: 'tenant_id, email, senha e nome são obrigatórios' });
    }

    const tenant = await Tenant.findByPk(tenant_id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    // Verifica quantos usuários já existem para este tenant.
    // Se não houver nenhum, o novo usuário será administrador.
    const existingUsers = await User.count({ where: { tenant_id } });
    const userRole = existingUsers === 0 ? 'admin' : 'member';

    const user = await User.create({
      tenant_id,
      email,
      name,
      role: userRole,
      password_hash
    });

    const token = generateToken(user);

    res.status(201).json({
      token,
      user: {
        id: user.id_usuario,
        email: user.email,
        name: user.name,
        role: user.role,
        tenant_id: user.tenant_id
      }
    });
  } catch (error) {
    console.error('Erro ao registrar usuário:', error);

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }

    res.status(500).json({ error: 'Erro interno do servidor ao registrar usuário' });
  }
};

/**
 * Autentica um usuário existente verificando email e senha.
 * Retorna o token JWT e os dados do usuário autenticado.
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const user = await User.findOne({
      where: { email },
      include: [{ model: Tenant, as: 'tenant' }]
    });

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash || '');
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user.id_usuario,
        email: user.email,
        name: user.name,
        role: user.role,
        tenant_id: user.tenant_id
      }
    });
  } catch (error) {
    console.error('Erro ao autenticar usuário:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao autenticar usuário' });
  }
};

/**
 * Retorna as informações do usuário atualmente autenticado.
 */
const me = (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Autenticação requerida' });
  }

  res.json({
    id: req.user.id_usuario,
    email: req.user.email,
    name: req.user.name,
    role: req.user.role,
    tenant_id: req.user.tenant_id
  });
};

module.exports = {
  register,
  login,
  me
};

