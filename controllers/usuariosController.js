const models = require("../models");
const bcrypt = require('bcryptjs');
const saltRounds = 10;


// Busca usuários filtrando pelo cargo informado
async function getUserByRole(req, res, role){
  try {
    const users = await models.User.findAll({
      where:{role: role}
    });
    return res.status(200).json(users);
  } catch (error) {
      console.log(error)
    return res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
}

// CREATE - Cria um novo usuário membro dentro do tenant do administrador
exports.createUser = async (req, res) => {
  try {
    const { email, password, name, cpf } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password e name são obrigatórios' });
    }

    const existingUser = await models.User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email já existe' });
    }

    const password_hash = await bcrypt.hash(password, saltRounds);

    const newUser = await models.User.create({
      tenant_id: req.user.tenant_id,
      email,
      name,
      role: 'member',
      principal: false,
      password_hash,
      cpf: cpf || null
    });

    return res.status(201).json({
      id: newUser.id_usuario,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      tenant_id: newUser.tenant_id
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: 'Erro ao criar usuário' });
  }
};

  
  // READ - Lista todos os usuários
  exports.getAllUsers = async (req, res) => {
    try {
      const users = await models.User.findAll(
        {
          order: [['created_at', 'ASC']] // Substitua 'nomeDoCampo' pelo campo pelo qual você deseja ordenar
        }
      );
      return res.status(200).json(users);
    } catch (error) {
        console.log(error)
      return res.status(500).json({ error: 'Erro ao buscar usuários' });
    }
  };

  // Lista usuários com cargo de colaborador
  exports.getColaboradores = async (req, res) => {
    getUserByRole(req, res, "COLABORADOR")
  };
  
  // READ - Busca um usuário por ID
  exports.getUserById = async (req, res) => {
    const { id } = req.params;
    try {
      const user = await models.User.findByPk(id,{
        include: [{
          model: models.Setores,
          as: "setor",
          attributes: ["nome"],
          paranoid: false
        }],
        raw:true
      });
      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }
      return res.status(200).json(user);
    } catch (error) {
      console.log(error)
      return res.status(500).json({ error: 'Erro ao buscar usuário' });
    }
  };
  
  // UPDATE - Atualiza um usuário por ID
  // Permite atualizar dados básicos (name, email, cpf) e senha (senhaAtual/novaSenha).
  // Regras adicionais apenas quando houver mudança de account_type:
  // - Só pode mudar account_type se o usuário alvo for principal e o tenant tiver exatamente 1 usuário ativo.
  // - Ao mudar para 'company' (alias: 'enterprise'), é obrigatório enviar enterprise_name e enterprise_cnpj para atualizar a empresa do tenant.
  exports.updateUser = async (req, res) => {
    try {
      const { id } = req.params;
      const targetUser = await models.User.findOne({ where: { id_usuario: id } });

      if (!targetUser) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      const isModerator = req.user?.role === 'moderator';
      const sameTenant = req.user?.tenant_id === targetUser.tenant_id;
      const isSelf = req.user?.id_usuario === targetUser.id_usuario;

      // Autorização básica: moderator pode atualizar qualquer usuário; demais, apenas a si próprio
      if (!isModerator && !isSelf) {
        return res.status(403).json({ error: 'Permissão insuficiente para atualizar este usuário' });
      }
      if (!isModerator && !sameTenant) {
        return res.status(403).json({ error: 'Acesso negado a usuário de outro tenant' });
      }

      const updates = {};

      // Campos básicos permitidos
      if (typeof req.body.name !== 'undefined') updates.name = req.body.name;
      if (typeof req.body.email !== 'undefined') updates.email = req.body.email;
      if (typeof req.body.cpf !== 'undefined') updates.cpf = req.body.cpf || null;

      // Mudança de senha (usa password_hash)
      if (req.body.senhaAtual && req.body.novaSenha) {
        const isMatch = await bcrypt.compare(String(req.body.senhaAtual || ''), targetUser.password_hash || '');
        if (!isMatch) {
          return res.status(401).json({ error: 'Senha atual fornecida está incorreta' });
        }
        const hashedPassword = await bcrypt.hash(String(req.body.novaSenha || ''), saltRounds);
        updates.password_hash = hashedPassword;
      }

      // Regras para account_type
      let requestedAccountType = req.body.account_type;
      if (typeof requestedAccountType !== 'undefined') {
        // Aceita alias 'enterprise' como 'company'
        if (requestedAccountType === 'enterprise') requestedAccountType = 'company';
        if (!['company', 'personal', null].includes(requestedAccountType)) {
          return res.status(400).json({ error: 'account_type inválido' });
        }

        // Apenas aplicável para usuário principal
        if (!targetUser.principal) {
          return res.status(400).json({ error: 'account_type só se aplica ao usuário principal' });
        }

        // Só pode mudar se o tenant tiver exatamente 1 usuário ativo
        const tenantUserCount = await models.User.count({ where: { tenant_id: targetUser.tenant_id, is_active: true } });
        if (tenantUserCount > 1) {
          return res.status(409).json({ error: 'Não é permitido alterar account_type com mais usuários cadastrados no tenant' });
        }

        updates.account_type = requestedAccountType;

        // Se for para 'company', validar e atualizar Enterprise
        if (requestedAccountType === 'company') {
          const enterprise_name = req.body.enterprise_name;
          const enterprise_cnpj = req.body.enterprise_cnpj;
          if (!enterprise_name || !enterprise_cnpj) {
            return res.status(400).json({ error: 'enterprise_name e enterprise_cnpj são obrigatórios ao definir account_type=company' });
          }

          // Atualiza a empresa do tenant na mesma transação
          const sequelize = models.sequelize;
          try {
            await sequelize.transaction(async (t) => {
              const enterprise = await models.Enterprise.findOne({ where: { tenant_id: targetUser.tenant_id } });
              if (enterprise) {
                await enterprise.update({ name: enterprise_name, cnpj: enterprise_cnpj }, { transaction: t });
              }
              await targetUser.update(updates, { transaction: t });
            });
            return res.status(200).json({
              id: targetUser.id_usuario,
              name: updates.name ?? targetUser.name,
              email: updates.email ?? targetUser.email,
              cpf: updates.cpf ?? targetUser.cpf,
              account_type: requestedAccountType
            });
          } catch (txErr) {
            console.log(txErr);
            if (txErr?.name === 'SequelizeUniqueConstraintError') {
              return res.status(409).json({ error: 'Email já cadastrado' });
            }
            return res.status(500).json({ error: 'Erro ao atualizar usuário/empresa' });
          }
        }
      }

      // Atualização normal (sem necessidade de atualizar Enterprise em conjunto)
      try {
        await targetUser.update(updates);
        return res.status(200).json({
          id: targetUser.id_usuario,
          name: targetUser.name,
          email: targetUser.email,
          cpf: targetUser.cpf,
          account_type: targetUser.account_type || null
        });
      } catch (err) {
        console.log(err);
        if (err?.name === 'SequelizeUniqueConstraintError') {
          return res.status(409).json({ error: 'Email já cadastrado' });
        }
        return res.status(500).json({ error: 'Erro ao atualizar usuário' });
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: 'Erro ao atualizar usuário' });
    }
  };

// PATCH - Atualiza a role de um usuário (apenas pelo principal)
exports.updateUserRole = async (req, res) => {
  try {
    if (!req.user.principal) {
      return res.status(403).json({ error: 'Apenas o usuário principal pode alterar roles' });
    }

    const { id } = req.params;
    const { role } = req.body;

    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Role inválida' });
    }

    const user = await models.User.findOne({ where: { id_usuario: id, tenant_id: req.user.tenant_id } });
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    await user.update({ role });
    return res.status(200).json({ id: user.id_usuario, role: user.role });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: 'Erro ao atualizar role' });
  }
};

  // DELETE - Remove um usuário por ID
  exports.deleteUser = async (req, res) => {
    const { id } = req.params;
    try {
      const deleted = await models.User.destroy({
        where: { id:id },
      });
      if (deleted > 0) {
        res.status(200).json({ message: "Setor deletado com sucesso" });
      } else {
        res.status(404).json({ message: "Setor não encontrada" });
      }
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao excluir usuário' });
    }
  };
  
