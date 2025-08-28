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
    const { email, password, name } = req.body;

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
      password_hash
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
  exports.updateUser = async (req, res) => {
    try {
      const { id } = req.params;
      const user = await models.User.findOne({ where: { id: id } });

      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      if (req.body.senhaAtual && req.body.novaSenha) {
        const isMatch = await bcrypt.compare(req.body.senhaAtual, user.senha);
        if (!isMatch) {
            return res.status(401).json({ error: 'Senha atual fornecida está incorreta' });
        }
        // Criptografa a nova senha
        const hashedPassword = await bcrypt.hash(req.body.novaSenha, saltRounds);
        req.body.senha = hashedPassword;
      }// Remove os campos senhaAtual e novaSenha, pois não estão no modelo e não queremos tentar atualizar esses campos
      delete req.body.senhaAtual;
      delete req.body.novaSenha;

      const [updated] = await models.User.update(req.body, {
          where: { id: id },
      });

      if (updated) {
          return res.status(200).json({ok: true});
      }

      return res.status(404).json({ error: 'Erro ao atualizar usuário' });

    } catch (error) {
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
  