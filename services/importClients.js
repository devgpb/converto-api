const csvParser = require('csv-parser');
const fs = require('fs');
const models = require('../models');
const { formataTexto } = require('../utils/utils');

async function importClientsFromCsv(filePath, enterpriseId) {
  const linhas = await new Promise((resolve, reject) => {
    const resultados = [];
    fs.createReadStream(filePath)
      .pipe(csvParser({
        separator: ';',
        mapHeaders: ({ header }) => header.trim()
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
    if (row.id_usuario) dados.id_usuario = row.id_usuario;
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
