const csvParser = require('csv-parser');
const fs = require('fs');
const models = require('../models');
const { formataTexto } = require('../utils/utils');

async function importClientsFromCsv(filePath, enterpriseId, assignUserId) {
  const linhas = await new Promise((resolve, reject) => {
    const resultados = [];
    const toSnake = (s) => s
      .trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/\W+/g, '_')
      .toLowerCase();

    fs.createReadStream(filePath)
      .pipe(csvParser({
        separator: ';',
        mapHeaders: ({ header }) => toSnake(header)
      }))
      .on('data', row => resultados.push(row))
      .on('end', () => resolve(resultados))
      .on('error', err => reject(err));
  });

  const resumo = { criados: 0, atualizados: 0, pulados: 0, erros: [] };

  const cacheStatus = new Map(); // key: `${enterpriseId}:${nome}` -> row
  const cacheCampanhas = new Map();
  async function ensureStatus(enterpriseId, nome) {
    if (!nome) return null;
    const key = `${enterpriseId}:${nome}`;
    if (cacheStatus.has(key)) return cacheStatus.get(key);
    const existed = await models.ClienteStatus.findOne({ where: { enterprise_id: enterpriseId, nome } });
    if (existed) { cacheStatus.set(key, existed); return existed; }
    const created = await models.ClienteStatus.create({ enterprise_id: enterpriseId, nome });
    cacheStatus.set(key, created);
    return created;
  }

  async function ensureCampanha(enterpriseId, nome) {
    if (!nome) return null;
    const key = `${enterpriseId}:${nome}`;
    if (cacheCampanhas.has(key)) return cacheCampanhas.get(key);
    const existed = await models.ClienteCampanha.findOne({ where: { enterprise_id: enterpriseId, nome } });
    if (existed) { cacheCampanhas.set(key, existed); return existed; }
    const created = await models.ClienteCampanha.create({ enterprise_id: enterpriseId, nome });
    cacheCampanhas.set(key, created);
    return created;
  }
  for (let [i, row] of linhas.entries()) {
    try {
      const celular = row.celular?.trim();
      const nomeRaw = row.nome?.trim();
      if (!celular || !nomeRaw) {
        resumo.erros.push({ linha: i + 1, motivo: 'Falta nome ou celular' });
        resumo.pulados++;
        continue;
      }

      const dados = { celular, nome: formataTexto(nomeRaw), enterprise_id: enterpriseId };
      if (row.status) dados.status = formataTexto(row.status.trim());
      if (row.cidade) dados.cidade = formataTexto(row.cidade.trim());
      if (assignUserId) dados.id_usuario = assignUserId;
      if (row.indicacao) dados.indicacao = formataTexto(row.indicacao.trim());
      if (row.campanha) dados.campanha = formataTexto(row.campanha.trim());
      // garante cadastro nas tabelas mestre
      let statusRow = null;
      let campanhaRow = null;
      if (dados.status) statusRow = await ensureStatus(enterpriseId, dados.status);
      if (dados.campanha) campanhaRow = await ensureCampanha(enterpriseId, dados.campanha);
      if (statusRow) dados.status = statusRow.id;
      if (campanhaRow) dados.campanha = campanhaRow.id;
      if (row.observacao) dados.observacao = formataTexto(row.observacao.trim());

      const existente = await models.Clientes.findOne({
        where: { celular, deleted_at: null, enterprise_id: enterpriseId }
      });

      let clienteObj;
      if (existente) {
        clienteObj = await existente.update(dados);
        resumo.atualizados++;
      } else {
        clienteObj = await models.Clientes.create(dados);
        resumo.criados++;
      }

      // não utiliza mais tabelas de mapeamento; relação direta por id nas colunas
    } catch (err) {
      resumo.erros.push({ linha: i + 1, motivo: err.message || 'Erro inesperado' });
    }
  }

  const successCount = resumo.criados + resumo.atualizados;
  const errorCount = resumo.erros.length;
  const metadata = [
    { label: 'Clientes Cadastrados', value: successCount },
    { label: 'Erros de Importação', value: errorCount },
  ];

  return { success: true, summary: resumo, metadata };
}

module.exports = { importClientsFromCsv };
