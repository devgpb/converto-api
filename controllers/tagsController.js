'use strict';

const { Op } = require('sequelize');
const models = require('../models');

function sanitizeText(value) {
  if (value == null) return value;
  let v = String(value);
  v = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  return v.trim();
}

function normalizeHex(hex) {
  if (!hex) return null;
  let v = String(hex).trim();
  if (v.startsWith('#')) v = v.slice(1);
  if (!/^[0-9A-Fa-f]{6}$/.test(v)) return null;
  return `#${v.toUpperCase()}`;
}

module.exports = {
  // GET /tags
  async list(req, res) {
    try {
      const { q, page = 1, limit = 20 } = req.query;
      const enterprise = req.enterprise;
      if (!enterprise || !enterprise.id) {
        return res.status(400).json({ error: 'Empresa não encontrada para o usuário atual.' });
      }

      const where = { enterprise_id: enterprise.id };
      if (q) {
        const termo = String(q).trim();
        if (termo) where.name = { [Op.iLike]: `%${termo}%` };
      }

      const offset = (Number(page) - 1) * Number(limit);
      const { rows, count } = await models.Tag.findAndCountAll({
        where,
        order: [['created_at', 'DESC']],
        limit: Number(limit),
        offset,
      });

      return res.status(200).json({ total: count, page: Number(page), limit: Number(limit), data: rows });
    } catch (err) {
      console.error('Erro ao listar tags:', err);
      return res.status(500).json({ error: 'Erro ao listar tags' });
    }
  },

  // POST /tags
  async create(req, res) {
    try {
      const enterprise = req.enterprise;
      if (!enterprise || !enterprise.id) {
        return res.status(400).json({ error: 'Empresa não encontrada para o usuário atual.' });
      }
      const name = sanitizeText(req.body?.name);
      const color_hex = normalizeHex(req.body?.color_hex);
      const description = sanitizeText(req.body?.description);

      if (!name) return res.status(400).json({ error: 'Campo name é obrigatório.' });

      const existing = await models.Tag.findOne({ where: { enterprise_id: enterprise.id, name } });
      if (existing) return res.status(409).json({ error: 'Já existe uma tag com esse nome.' });

      const created = await models.Tag.create({ enterprise_id: enterprise.id, name, color_hex, description });
      return res.status(201).json(created);
    } catch (err) {
      console.error('Erro ao criar tag:', err);
      return res.status(500).json({ error: 'Erro ao criar tag' });
    }
  },

  // GET /tags/:id
  async get(req, res) {
    try {
      const enterprise = req.enterprise;
      if (!enterprise || !enterprise.id) {
        return res.status(400).json({ error: 'Empresa não encontrada para o usuário atual.' });
      }
      const tag = await models.Tag.findOne({ where: { id: req.params.id, enterprise_id: enterprise.id } });
      if (!tag) return res.status(404).json({ error: 'Tag não encontrada' });
      return res.status(200).json(tag);
    } catch (err) {
      console.error('Erro ao obter tag:', err);
      return res.status(500).json({ error: 'Erro ao obter tag' });
    }
  },

  // PUT /tags/:id
  async update(req, res) {
    try {
      const enterprise = req.enterprise;
      if (!enterprise || !enterprise.id) {
        return res.status(400).json({ error: 'Empresa não encontrada para o usuário atual.' });
      }
      const tag = await models.Tag.findOne({ where: { id: req.params.id, enterprise_id: enterprise.id } });
      if (!tag) return res.status(404).json({ error: 'Tag não encontrada' });

      const updates = {};
      if (req.body.name !== undefined) {
        const name = sanitizeText(req.body.name);
        if (!name) return res.status(400).json({ error: 'Campo name é obrigatório.' });
        // valida unicidade por enterprise
        const exists = await models.Tag.findOne({ where: { enterprise_id: enterprise.id, name, id: { [Op.ne]: tag.id } } });
        if (exists) return res.status(409).json({ error: 'Já existe uma tag com esse nome.' });
        updates.name = name;
      }
      if (req.body.color_hex !== undefined) updates.color_hex = normalizeHex(req.body.color_hex);
      if (req.body.description !== undefined) updates.description = sanitizeText(req.body.description);

      await tag.update(updates);
      return res.status(200).json(tag);
    } catch (err) {
      console.error('Erro ao atualizar tag:', err);
      return res.status(500).json({ error: 'Erro ao atualizar tag' });
    }
  },

  // DELETE /tags/:id
  async remove(req, res) {
    try {
      const enterprise = req.enterprise;
      if (!enterprise || !enterprise.id) {
        return res.status(400).json({ error: 'Empresa não encontrada para o usuário atual.' });
      }
      const tag = await models.Tag.findOne({ where: { id: req.params.id, enterprise_id: enterprise.id } });
      if (!tag) return res.status(404).json({ error: 'Tag não encontrada' });
      await tag.destroy();
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('Erro ao deletar tag:', err);
      return res.status(500).json({ error: 'Erro ao deletar tag' });
    }
  },
};

