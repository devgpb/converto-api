const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { User, Tenant, Subscription } = require('../models');
const { sendMail } = require('../utils/email');
const { sendPasswordResetEmail } = require('../services/emailService');

const getProfile = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Autenticação requerida' });
    }

    const profile = {
      id: req.user.id_usuario,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      principal: !!req.user.principal,
      account_type: req.user.account_type || null,
      cpf: req.user.cpf || null,
      // tenant: req.tenant ? { id: req.tenant.id, name: req.tenant.name } : null,
      enterprise: req.enterprise ? { id: req.enterprise.id, name: req.enterprise.name } : null
    };

    if (req.user.role === 'admin' || req.user.role === 'moderator') {
      const tenant = await Tenant.findByPk(req.user.tenant_id, {
        include: [
          {
            model: Subscription,
            as: 'subscriptions',
            where: { status: ['active', 'trialing'] },
            required: false
          },
          { model: User, as: 'users' }
        ]
      });

      if (tenant) {
        const activeSubscription = tenant.subscriptions.find(sub =>
          ['active', 'trialing'].includes(sub.status)
        );
        const activeUsersCount = tenant.users.filter(u => u.is_active).length;
        const totalUsersCount = tenant.users.length;
        const paidSeats = activeSubscription ? activeSubscription.quantity : 0;

        profile.seats = {
          paid: paidSeats,
          active_users: activeUsersCount,
          total_users: totalUsersCount,
          available: Math.max(0, paidSeats - activeUsersCount),
          subscription_status: activeSubscription ? activeSubscription.status : 'none'
        };
      }
    }

    res.json(profile);
  } catch (error) {
    console.error('Erro ao obter perfil:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao obter perfil' });
  }
};

const updateProfile = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Autenticação requerida' });
    }

    const { cpf } = req.body;

    const user = await User.findByPk(req.user.id_usuario);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Atualiza apenas campos permitidos (cpf opcional)
    const dataToUpdate = {};
    if (typeof cpf !== 'undefined') dataToUpdate.cpf = cpf || null;

    if (Object.keys(dataToUpdate).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
    }

    await user.update(dataToUpdate);

    res.json({
      id: user.id_usuario,
      cpf: user.cpf || null,
    });
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao atualizar perfil' });
  }
};

const changePassword = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Autenticação requerida' });
    }

    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Senha antiga e nova são obrigatórias' });
    }

    const user = await User.findByPk(req.user.id_usuario);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const isValid = await bcrypt.compare(oldPassword, user.password_hash || '');
    if (!isValid) {
      return res.status(401).json({ error: 'Senha atual incorreta' });
    }

    // Validação de força de senha no servidor
    const pwd = String(newPassword || '');
    const hasMinLength = pwd.length >= 8;
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNumber = /\d/.test(pwd);
    const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
    if (!(hasMinLength && hasUpper && hasLower && hasNumber && hasSpecial)) {
      return res.status(400).json({
        error: 'Senha fraca. Use no mínimo 8 caracteres com maiúscula, minúscula, número e símbolo.'
      });
    }

    const password_hash = await bcrypt.hash(newPassword, 10);
    await user.update({ password_hash });

    try {
      await sendMail(user.email, 'Senha alterada', 'Sua senha foi alterada com sucesso.');
    } catch (emailError) {
      console.error('Erro ao enviar email de confirmação:', emailError);
    }

    res.json({ message: 'Senha alterada com sucesso' });
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao alterar senha' });
  }
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email é obrigatório' });
  }

  try {
    const user = await User.findOne({ where: { email } });
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 3600000);
      await user.update({ reset_token: token, reset_token_expires: expires });
      const link = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
      try {
        await sendPasswordResetEmail(user, link);
      } catch (emailError) {
        console.error('Erro ao enviar email de recuperação:', emailError);
      }
    }

    res.json({ message: 'Se o email existir em nossa base, enviaremos instruções de recuperação.' });
  } catch (error) {
    console.error('Erro ao solicitar recuperação de senha:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao solicitar recuperação de senha' });
  }
};

const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token e nova senha são obrigatórios' });
  }

  try {
    const user = await User.findOne({
      where: {
        reset_token: token,
        reset_token_expires: { [Op.gt]: new Date() }
      }
    });

    if (!user) {
      return res.status(400).json({ error: 'Token inválido ou expirado' });
    }

    // Validação de força de senha no servidor
    const pwd = String(newPassword || '');
    const hasMinLength = pwd.length >= 8;
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNumber = /\d/.test(pwd);
    const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
    if (!(hasMinLength && hasUpper && hasLower && hasNumber && hasSpecial)) {
      return res.status(400).json({
        error: 'Senha fraca. Use no mínimo 8 caracteres com maiúscula, minúscula, número e símbolo.'
      });
    }

    const password_hash = await bcrypt.hash(newPassword, 10);
    await user.update({ password_hash, reset_token: null, reset_token_expires: null });

    res.json({ message: 'Senha redefinida com sucesso' });
  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao redefinir senha' });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword
};
