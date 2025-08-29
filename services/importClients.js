const csvParser = require('csv-parser');
const fs = require('fs');
const models = require('../models');
const { formataTexto } = require('../utils/utils');

async function importClientsFromCsv(filePath, enterpriseId, userId) {
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
  for (let [i, row] of linhas.entries()) {
    const celular = row.celular?.trim();
    const nomeRaw = row.nome?.trim();
    if (!celular || !nomeRaw) {
      resumo.erros.push({ linha: i + 1, motivo: 'Falta nome ou celular' });
      continue;
    }

    const dados = { celular, nome: formataTexto(nomeRaw), enterprise_id: enterpriseId };
    if (row.status) dados.status = formataTexto(row.status.trim());
    if (row.cidade) dados.cidade = formataTexto(row.cidade.trim());
    dados.id_usuario = userId;
    if (row.indicacao) dados.indicacao = formataTexto(row.indicacao.trim());
    if (row.campanha) dados.campanha = formataTexto(row.campanha.trim());
    if (row.observacao) dados.observacao = formataTexto(row.observacao.trim());

    const existente = await models.Clientes.findOne({
      where: { celular, deleted_at: null, enterprise_id: enterpriseId }
    });

    if (existente) {
      await existente.update(dados);
      resumo.atualizados++;
    } else {
      await models.Clientes.create(dados);
      resumo.criados++;
    }
  }

  return resumo;
}

module.exports = { importClientsFromCsv };
