const models = require('../models');

exports.createSugestao = async (req, res) => {
  try {
    const { tipo, mensagem } = req.body;

    if (!tipo || !mensagem) {
      return res.status(400).json({ error: 'Tipo e mensagem são obrigatórios' });
    }

    const tiposValidos = ['Comentário', 'Sugestão', 'Bug'];
    if (!tiposValidos.includes(tipo)) {
      return res.status(400).json({ error: 'Tipo inválido' });
    }

    if (mensagem.length > 800) {
      return res.status(400).json({ error: 'Mensagem deve ter até 800 caracteres' });
    }

    const sugestao = await models.Sugestoes.create({
      tipo,
      mensagem,
      id_usuario: req.user.id_usuario,
    });
    return res.status(201).json(sugestao);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};

exports.listSugestoes = async (_req, res) => {
  try {
    const sugestoes = await models.Sugestoes.findAll({
      include: {
        model: models.User,
        as: 'usuario',
        attributes: ['id_usuario', 'name', 'email'],
      },
    });
    return res.json(sugestoes);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
};
