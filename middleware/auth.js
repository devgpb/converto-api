const jwt = require('jsonwebtoken');
const { User, Tenant, Enterprise } = require('../models');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso requerido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.user_id, {
      include: [{ model: Tenant, as: 'tenant', include: [{ model: Enterprise, as: 'enterprise' }] }]
    });

    if (!user || !user.is_active) {
      return res.status(403).json({ error: 'Usuário não encontrado ou inativo' });
    }

    req.user = user;
    req.tenant = user.tenant;
    req.enterprise = user.tenant ? user.tenant.enterprise : null;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Token inválido' });
  }
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Autenticação requerida' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Permissão insuficiente' });
    }

    next();
  };
};

module.exports = {
  authenticateToken,
  requireRole
};

