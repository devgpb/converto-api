// controllers/mensagensPadraoController.js
'use strict';

const { Op } = require('sequelize');
const models = require('../models');

// Sanitização: trim, preserva quebras de linha, permite emojis (utf8mb4) e escapa HTML perigoso
function sanitizeText(value) {
  if (value == null) return value;
  let v = String(value);

  // remove bytes nulos e caracteres de controle exceto \n, \r, \t
  v = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

  // trim (fronteiras)
  v = v.trim();

  // escapa HTML básico para evitar XSS/injeções em campos textuais
  // mantém \n para formatação e emojis (pares substitutos) intactos
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  v = v.replace(/[&<>"']/g, ch => map[ch]);

  return v;
}

module.exports = {
  // GET /mensagens-padrao
  async listar(req, res) {
    try {
      const { q, page = 1, limit = 20 } = req.query;
      const where = {};

      if (q) {
        const termo = String(q).trim();
        if (termo) {
          where[Op.or] = [
            { nome: { [Op.like]: `%${termo}%` } },
            { mensagem: { [Op.like]: `%${termo}%` } }
          ];
        }
      }

      const offset = (Number(page) - 1) * Number(limit);

      const { rows, count } = await models.mensagensPadrao.findAndCountAll({
        where,
        order: [['createdAt', 'DESC']],
        limit: Number(limit),
        offset
      });

      return res.status(200).json({
        sucesso: true,
        total: count,
        pagina: Number(page),
        limite: Number(limit),
        dados: rows
      });
    } catch (error) {
      console.error('Erro ao listar mensagensPadrao:', error);
      return res.status(500).json({ sucesso: false, mensagem: 'Erro ao listar mensagens padrão.' });
    }
  },

  // POST /mensagens-padrao
  async criar(req, res) {
    try {
      const payload = req.body || {};

      // tratamento e proteção dos campos (trim + sanitização, preservando emojis e quebras de linha)
      const nome = sanitizeText(payload.nome);
      const mensagem = sanitizeText(payload.mensagem);

      if (!nome || !mensagem) {
        return res.status(400).json({ sucesso: false, mensagem: 'Campos nome e mensagem são obrigatórios.' });
      }

      const criado = await models.mensagensPadrao.create({
        nome,
        mensagem
      });

      return res.status(201).json({ sucesso: true, mensagem: 'Mensagem padrão criada com sucesso.', dado: criado });
    } catch (error) {
      console.error('Erro ao criar mensagensPadrao:', error);
      return res.status(500).json({ sucesso: false, mensagem: 'Erro ao criar mensagem padrão.' });
    }
  },

  // GET /mensagens-padrao/:idMensagem
  async obter(req, res) {
    try {
      const { idMensagem } = req.params;

      const registro = await models.mensagensPadrao.findByPk(idMensagem);
      if (!registro) {
        return res.status(404).json({ sucesso: false, mensagem: 'Mensagem padrão não encontrada.' });
      }

      return res.status(200).json({ sucesso: true, dado: registro });
    } catch (error) {
      console.error('Erro ao obter mensagensPadrao:', error);
      return res.status(500).json({ sucesso: false, mensagem: 'Erro ao obter mensagem padrão.' });
    }
  },

  // PUT /mensagens-padrao/:idMensagem
  async atualizar(req, res) {
    try {
      const { idMensagem } = req.params;
      const payload = req.body || {};

      const registro = await models.mensagensPadrao.findByPk(idMensagem);
      if (!registro) {
        return res.status(404).json({ sucesso: false, mensagem: 'Mensagem padrão não encontrada.' });
      }

      const dadosAtualizados = {};
      if (payload.nome !== undefined) dadosAtualizados.nome = sanitizeText(payload.nome);
      if (payload.mensagem !== undefined) dadosAtualizados.mensagem = sanitizeText(payload.mensagem);

      await registro.update(dadosAtualizados);

      return res.status(200).json({ sucesso: true, mensagem: 'Mensagem padrão atualizada com sucesso.', dado: registro });
    } catch (error) {
      console.error('Erro ao atualizar mensagensPadrao:', error);
      return res.status(500).json({ sucesso: false, mensagem: 'Erro ao atualizar mensagem padrão.' });
    }
  },

  // DELETE /mensagens-padrao/:idMensagem
  async deletar(req, res) {
    try {
      const { idMensagem } = req.params;

      const registro = await models.mensagensPadrao.findByPk(idMensagem);
      if (!registro) {
        return res.status(404).json({ sucesso: false, mensagem: 'Mensagem padrão não encontrada.' });
      }

      await registro.destroy(); // paranoid: true -> soft delete

      return res.status(200).json({ sucesso: true, mensagem: 'Mensagem padrão deletada com sucesso.' });
    } catch (error) {
      console.error('Erro ao deletar mensagensPadrao:', error);
      return res.status(500).json({ sucesso: false, mensagem: 'Erro ao deletar mensagem padrão.' });
    }
  }
};
