const models = require("../models");
const bcrypt = require('bcryptjs');
const saltRounds = 10;


// Busca usuÃ¡rios filtrando pelo cargo informado
async function getUserByRole(req, res, role){
  try {
    const users = await models.User.findAll({
      where:{role: role}
    });
    return res.status(200).json(users);
  } catch (error) {
      console.log(error)
    return res.status(500).json({ error: 'Erro ao buscar usuÃ¡rios' });
  }
}

// CREATE - Cria um novo usuÃ¡rio membro dentro do tenant do administrador
exports.createUser = async (req, res) => {
  try {
    const { email, password, name, cpf } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password e name sÃ£o obrigatÃ³rios' });
    }

    const existingUser = await models.User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email jÃ¡ existe' });
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
    return res.status(500).json({ error: 'Erro ao criar usuÃ¡rio' });
  }
};

  
  // READ - Lista todos os usuÃ¡rios
  exports.getAllUsers = async (req, res) => {
    try {
      const users = await models.User.findAll(
        {
          order: [['created_at', 'ASC']] // Substitua 'nomeDoCampo' pelo campo pelo qual vocÃª deseja ordenar
        }
      );
      return res.status(200).json(users);
    } catch (error) {
        console.log(error)
      return res.status(500).json({ error: 'Erro ao buscar usuÃ¡rios' });
    }
  };

  // Lista usuÃ¡rios com cargo de colaborador
  exports.getColaboradores = async (req, res) => {
    getUserByRole(req, res, "COLABORADOR")
  };
  
  // READ - Busca um usuÃ¡rio por ID
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
        return res.status(404).json({ error: 'UsuÃ¡rio nÃ£o encontrado' });
      }
      // Inclui tags do usuário sem quebrar o shape atual (raw:true)
      try {
        const userWithTags = await models.User.findOne({
          where: { id_usuario: id },
          include: [{ model: models.Tag, as: 'tags', attributes: ['id', 'name', 'color_hex', 'description'] }],
        });
        const tags = Array.isArray(userWithTags?.tags) ? userWithTags.tags.map(t => ({
          id: t.id,
          name: t.name,
          color_hex: t.color_hex,
          description: t.description,
        })) : [];
        return res.status(200).json({ ...user, tags });
      } catch (_) {
        return res.status(200).json({ ...user, tags: [] });
      }
    } catch (error) {
      console.log(error)
      return res.status(500).json({ error: 'Erro ao buscar usuÃ¡rio' });
    }
  };
  
  // UPDATE - Atualiza um usuÃ¡rio por ID
  // Permite atualizar dados bÃ¡sicos (name, email, cpf) e senha (senhaAtual/novaSenha).
  // Regras adicionais apenas quando houver mudanÃ§a de account_type:
  // - SÃ³ pode mudar account_type se o usuÃ¡rio alvo for principal e o tenant tiver exatamente 1 usuÃ¡rio ativo.
  // - Ao mudar para 'company' (alias: 'enterprise'), Ã© obrigatÃ³rio enviar enterprise_name e enterprise_cnpj para atualizar a empresa do tenant.
  exports.updateUser = async (req, res) => {
    try {
      const { id } = req.params;
      const targetUser = await models.User.findOne({ where: { id_usuario: id } });

      if (!targetUser) {
        return res.status(404).json({ error: 'UsuÃ¡rio nÃ£o encontrado' });
      }

      const isModerator = req.user?.role === 'moderator';
      const sameTenant = req.user?.tenant_id === targetUser.tenant_id;
      const isSelf = req.user?.id_usuario === targetUser.id_usuario;

      // AutorizaÃ§Ã£o bÃ¡sica: moderator pode atualizar qualquer usuÃ¡rio; demais, apenas a si prÃ³prio
      if (!isModerator && !isSelf) {
        return res.status(403).json({ error: 'PermissÃ£o insuficiente para atualizar este usuÃ¡rio' });
      }
      if (!isModerator && !sameTenant) {
        return res.status(403).json({ error: 'Acesso negado a usuÃ¡rio de outro tenant' });
      }

      const updates = {};      // Se for alterar email, verificar unicidade global
      if (typeof req.body.email !== 'undefined' && req.body.email !== targetUser.email) {
        const exists = await models.User.findOne({ where: { email: req.body.email } });
        if (exists && exists.id_usuario !== targetUser.id_usuario) {
          return res.status(409).json({ error: 'Email já cadastrado' });
        }
      }

      // Campos bÃ¡sicos permitidos
      if (typeof req.body.name !== 'undefined') updates.name = req.body.name;
      if (typeof req.body.email !== 'undefined') updates.email = req.body.email;
      if (typeof req.body.cpf !== 'undefined') updates.cpf = req.body.cpf || null;

      // MudanÃ§a de senha (usa password_hash)
      if (req.body.senhaAtual && req.body.novaSenha) {
        const isMatch = await bcrypt.compare(String(req.body.senhaAtual || ''), targetUser.password_hash || '');
        if (!isMatch) {
          return res.status(401).json({ error: 'Senha atual fornecida estÃ¡ incorreta' });
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
          return res.status(400).json({ error: 'account_type invÃ¡lido' });
        }

        // Apenas aplicÃ¡vel para usuÃ¡rio principal
        if (!targetUser.principal) {
          return res.status(400).json({ error: 'account_type sÃ³ se aplica ao usuÃ¡rio principal' });
        }

        // SÃ³ pode mudar se o tenant tiver exatamente 1 usuÃ¡rio ativo
        const tenantUserCount = await models.User.count({ where: { tenant_id: targetUser.tenant_id, is_active: true } });
        if (tenantUserCount > 1) {
          return res.status(409).json({ error: 'NÃ£o Ã© permitido alterar account_type com mais usuÃ¡rios cadastrados no tenant' });
        }

        updates.account_type = requestedAccountType;

        // Se for para 'company', validar e atualizar Enterprise
        if (requestedAccountType === 'company') {
          const enterprise_name = req.body.enterprise_name;
          const enterprise_cnpj = req.body.enterprise_cnpj;
          if (!enterprise_name || !enterprise_cnpj) {
            return res.status(400).json({ error: 'enterprise_name e enterprise_cnpj sÃ£o obrigatÃ³rios ao definir account_type=company' });
          }

          // Atualiza a empresa do tenant na mesma transaÃ§Ã£o
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
              return res.status(409).json({ error: 'Email jÃ¡ cadastrado' });
            }
            return res.status(500).json({ error: 'Erro ao atualizar usuÃ¡rio/empresa' });
          }
        }
      }

      // AtualizaÃ§Ã£o normal (sem necessidade de atualizar Enterprise em conjunto)
      try {
        await targetUser.update(updates);
        // Atualiza tags, se fornecidas (fora de transação para minimizar impacto na rota existente)
        try {
          let incomingTagIds = null;
          if (Array.isArray(req.body?.tag_ids)) incomingTagIds = req.body.tag_ids;
          else if (Array.isArray(req.body?.tags)) incomingTagIds = req.body.tags;
          if (incomingTagIds) {
            const enterpriseId = req.enterprise?.id;
            if (!enterpriseId) {
              return res.status(400).json({ error: 'Empresa não encontrada para o usuário atual.' });
            }
            const validTags = await models.Tag.findAll({ where: { id: incomingTagIds, enterprise_id: enterpriseId } });
            if (validTags.length !== incomingTagIds.length) {
              const validIds = new Set(validTags.map(x => x.id));
              const notFound = incomingTagIds.filter(x => !validIds.has(x));
              return res.status(400).json({ error: 'Algumas tags não foram encontradas para esta empresa.', detalhes: notFound });
            }
            await targetUser.setTags(validTags);
          }
        } catch (tagErr) {
          console.log('Erro ao atualizar tags do usuário:', tagErr);
          return res.status(500).json({ error: 'Erro ao atualizar tags do usuário' });
        }

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
          return res.status(409).json({ error: 'Email jÃ¡ cadastrado' });
        }
        return res.status(500).json({ error: 'Erro ao atualizar usuÃ¡rio' });
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: 'Erro ao atualizar usuÃ¡rio' });
    }
  };

// PATCH - Atualiza a role de um usuÃ¡rio (apenas pelo principal)
exports.updateUserRole = async (req, res) => {
  try {
    if (!req.user.principal) {
      return res.status(403).json({ error: 'Apenas o usuÃ¡rio principal pode alterar roles' });
    }

    const { id } = req.params;
    const { role } = req.body;

    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Role invÃ¡lida' });
    }

    const user = await models.User.findOne({ where: { id_usuario: id, tenant_id: req.user.tenant_id } });
    if (!user) {
      return res.status(404).json({ error: 'UsuÃ¡rio nÃ£o encontrado' });
    }

    await user.update({ role });
    return res.status(200).json({ id: user.id_usuario, role: user.role });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: 'Erro ao atualizar role' });
  }
};

  // DELETE - Remove um usuÃ¡rio por ID
  exports.deleteUser = async (req, res) => {
    const { id } = req.params;
    try {
      const deleted = await models.User.destroy({
        where: { id_usuario: id },
      });
      if (deleted > 0) {
        res.status(200).json({ message: "Setor deletado com sucesso" });
      } else {
        res.status(404).json({ message: "Setor nÃ£o encontrada" });
      }
    } catch (error) {
      return res.status(500).json({ error: 'Erro ao excluir usuÃ¡rio' });
    }
  };
  

