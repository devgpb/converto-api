const { Op, fn, col, where } = require('sequelize');
const models = require("../models");

exports.pesquisarNumero = async (req, res) => {
  try {
    // 1) pega só dígitos
    let numero = (req.query.numero || "").replace(/\D/g, "");
    if (!numero) {
      return res.status(400).json({ message: "Parâmetro 'numero' é obrigatório" });
    }

    // 2) remove DDI '55'
    if (numero.startsWith("55")) {
      numero = numero.slice(2);
    }

    // 3) injeta '9' se vier DDD+8
    if (numero.length === 10) {
      numero = numero.slice(0, 2) + "9" + numero.slice(2);
    }

    // 4) valida 11 dígitos
    if (numero.length !== 11) {
      return res.status(400).json({
        message: "Número inválido: deve resultar em 2 dígitos de DDD + 9 dígitos de celular"
      });
    }

    // 5) cria a string formatada "(xx) xxxxx-xxxx"
    const ddd = numero.slice(0, 2);
    const parte1 = numero.slice(2, 7);
    const parte2 = numero.slice(7);
    const celularFormatado = `(${ddd}) ${parte1}-${parte2}`;


    // 6) busca: ou pelo campo formatado, ou limpando o campo no SQL e comparando só dígitos
    const cliente = await models.Clientes.findOne({
      where: {
        deleted_at: null,
        [Op.or]: [
          { celular: celularFormatado },
          where(
            fn("regexp_replace", col("Clientes.celular"), "[^0-9]", "", "g"),
            numero
          )
        ]
      },
      include: [{
        model: models.User,
        as: 'responsavel',
        attributes: ['nomeCompleto', 'id_usuario'],
      }] 
    });

    if (!cliente) {
      return res.status(404).json({ message: "Cliente não encontrado" });
    }
    return res.json(cliente);
  } catch (error) {
    console.error("pesquisarNumero:", error);
    return res.status(500).json({
      message: "Erro ao pesquisar número",
      error: error.message
    });
  }
};

exports.marcarPrimeiraMensagemDia = async (req, res) => {
  try {
    const { id_cliente } = req.body;
    const cliente = await models.Clientes.findByPk(id_cliente);
    if (!cliente) {
      return res.status(404).json({ message: "Cliente não encontrado" });
    }

    cliente.ultimo_contato = new Date();
    await cliente.save();

    return res.json({ ok: true, message: "Primeira mensagem do dia marcada com sucesso", cliente });
  } catch (error) {
    console.error("marcarPrimeiraMensagemDia:", error);
    return res.status(500).json({
      message: "Erro ao marcar primeira mensagem do dia",
      error: error.message
    });
  }

}
