const models = require("../models");
const bcrypt = require('bcryptjs');
const saltRounds = 10;
const generateShortCode = require('../utils/rest').generateShortCode



async function getUserByCargo(req, res, cargo){
  try {
    const users = await models.User.findAll({
      where:{cargo: cargo}
    });
    return res.status(200).json(users);
  } catch (error) {
      console.log(error)
    return res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
}

// CREATE - Cria um novo usuário
  exports.createUser = async (req, res) => {
    try {
      // Verifique se o email já existe no banco de dados
    const existingUser = await models.User.findOne({ where: { email: req.body.email } });

    if (existingUser) {
      // Se o email já existir, retorne um erro
      return res.status(400).json({ error: 'Email já existe' });
    }
      const hash = await bcrypt.hash(req.body.senha, saltRounds)
      req.body.senha = hash

      const ref = await generateShortCode()
      req.body.referencia = ref
      console.log(req.body)

      const newUser = await models.User.create(req.body);
      return res.status(201).json(newUser);
    } catch (error) {
      console.log(error)
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

  exports.getColaboradores = async (req, res) => {
    getUserByCargo(req, res, "COLABORADOR")
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
  