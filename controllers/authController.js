const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Tenant } = require('../models');

const generateToken = (user) => {
  return jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
    expiresIn: '1h'
  });
};

const register = async (req, res) => {
  try {
    const { tenant_id, email, password, name, role } = req.body;

    if (!tenant_id || !email || !password || !name) {
      return res.status(400).json({ error: 'tenant_id, email, senha e nome são obrigatórios' });
    }

    const tenant = await Tenant.findByPk(tenant_id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      tenant_id,
      email,
      name,
      role: role || 'member',
      password_hash
    });

    const token = generateToken(user);

    res.status(201).json({
      token,
      user: {
        id: user.id,
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
        id: user.id,
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

const me = (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Autenticação requerida' });
  }

  res.json({
    id: req.user.id,
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

