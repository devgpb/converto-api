const bcrypt = require('bcryptjs');
const { User, Tenant, Subscription } = require('../models');
const { sendMail } = require('../utils/email');

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
      tenant: req.tenant ? { id: req.tenant.id, name: req.tenant.name } : null,
      enterprise: req.enterprise ? { id: req.enterprise.id, name: req.enterprise.name } : null
    };

    if (req.user.role === 'admin') {
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

module.exports = {
  getProfile,
  changePassword
};
