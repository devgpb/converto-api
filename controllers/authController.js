const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User, Tenant } = require('../models');
const { sendPasswordResetEmail } = require('../services/emailService');

/**
 * Gera um token JWT para o usuário fornecido.
 * @param {Object} user - Instância do usuário autenticado.
 * @returns {string} Token JWT válido por 1 hora.
 */
const generateToken = (user) => {
  return jwt.sign(
    {
      user_id: user.id_usuario,
      tenant_id: user.tenant_id,   // 👈 agora vem no payload
      role: user.role,
      email: user.email
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

/**
 * Registra a conta primária de um tenant.
 * Sempre cria um administrador com flag `principal` true.
 * Se já existir um usuário principal para o tenant, o registro é negado.
 */
const register = async (req, res) => {
  try {
    const { tenant_id, email, password, name, cpf } = req.body;
    // account_type can be 'company' | 'personal' | 'enterprise' (alias)
    let { account_type, enterprise_name, enterprise_cnpj, cnpj } = req.body || {};
    if (account_type === 'enterprise') account_type = 'company';

    if (!tenant_id || !email || !password || !name) {
      return res.status(400).json({ error: 'tenant_id, email, senha e nome são obrigatórios' });
    }

    const tenant = await Tenant.findByPk(tenant_id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    const existingPrincipal = await User.findOne({ where: { tenant_id, principal: true } });
    if (existingPrincipal) {
      return res.status(403).json({ error: 'Tenant já possui um usuário principal' });
    }

    // Check duplicate email globally for friendly message
    const existingEmail = await User.findOne({ where: { email } });
    if (existingEmail) {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const normalizedAccountType = account_type && ['company', 'personal'].includes(account_type)
      ? account_type
      : null;

    const user = await User.create({
      tenant_id,
      email,
      name,
      role: 'admin',
      principal: true,
      account_type: normalizedAccountType,
      password_hash,
      cpf: cpf || null
    });

    // If company type and info present, update Enterprise details quietly
    try {
      if (normalizedAccountType === 'company') {
        const models = require('../models');
        const ent = await models.Enterprise.findOne({ where: { tenant_id } });
        if (ent) {
          const newName = enterprise_name || name;
          const newCnpj = (enterprise_cnpj || cnpj || null) || ent.cnpj;
          await ent.update({ name: newName || ent.name, cnpj: newCnpj });
        }
      }
    } catch (e) {
      console.warn('Falha ao atualizar enterprise durante registro:', e?.message || e);
    }

    const token = generateToken(user);

    res.status(201).json({
      token,
      user: {
        id: user.id_usuario,
        email: user.email,
        name: user.name,
        role: user.role,
        principal: user.principal,
        account_type: user.account_type,
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
        principal: user.principal,
        account_type: user.account_type,
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
    principal: req.user.principal,
    account_type: req.user.account_type,
    tenant_id: req.user.tenant_id
  });
};

module.exports = {
  register,
  login,
  me,
  /**
   * Envia e-mail com link de redefinição de senha.
   * Aceita: { email }
   */
  forgotPassword: async (req, res) => {
    try {
      const { email } = req.body || {};
      if (!email) {
        return res.status(400).json({ error: 'Email é obrigatório' });
      }

      const user = await User.findOne({ where: { email } });
      // Resposta genérica para evitar enumeração de e-mails
      const genericResponse = { message: 'Se o email existir, enviaremos as instruções' };

      if (!user || !user.is_active) {
        return res.json(genericResponse);
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 hora

      user.reset_token = token;
      user.reset_token_expires = expires;
      await user.save();

      const appUrl = process.env.APP_URL || 'http://localhost:5321';
      const link = `${appUrl}/redefinir-senha?token=${token}`;

      try {
        await sendPasswordResetEmail(user, link);
      } catch (err) {
        console.error('Erro ao enviar email de reset:', err);
        // Ainda retornamos sucesso genérico
      }

      return res.json(genericResponse);
    } catch (error) {
      console.error('Erro no forgotPassword:', error);
      return res.status(500).json({ error: 'Erro interno ao solicitar redefinição' });
    }
  },

  /**
   * Redefine a senha com base em um token válido.
   * Aceita: { token, password }
   */
  resetPassword: async (req, res) => {
    try {
      const { token, password } = req.body || {};
      if (!token || !password) {
        return res.status(400).json({ error: 'Token e nova senha são obrigatórios' });
      }

      // Validação de força de senha no servidor
      const pwd = String(password || '');
      const hasMinLength = pwd.length >= 8;
      const hasUpper = /[A-Z]/.test(pwd);
      const hasLower = /[a-z]/.test(pwd);
      const hasNumber = /\d/.test(pwd);
      const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
      if (!(hasMinLength && hasUpper && hasLower && hasNumber && hasSpecial)) {
        return res.status(400).json({
          error:
            'Senha fraca. Use no mínimo 8 caracteres com maiúscula, minúscula, número e símbolo.'
        });
      }

      const user = await User.findOne({ where: { reset_token: token } });
      if (!user || !user.reset_token_expires || new Date(user.reset_token_expires) < new Date()) {
        return res.status(400).json({ error: 'Token inválido ou expirado' });
      }

      const password_hash = await bcrypt.hash(password, 10);
      user.password_hash = password_hash;
      user.reset_token = null;
      user.reset_token_expires = null;
      await user.save();

      return res.json({ message: 'Senha redefinida com sucesso' });
    } catch (error) {
      console.error('Erro no resetPassword:', error);
      return res.status(500).json({ error: 'Erro interno ao redefinir senha' });
    }
  }
};
