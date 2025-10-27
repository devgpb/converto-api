const csvParser = require('csv-parser');
const fs = require('fs');
const models = require('../models');
const { formataTexto } = require('../utils/utils');

function normalizaCelularBR(input) {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  // remove tudo que não for dígito
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  // remove DDI +55 se vier e sobrar mais de 11 dígitos
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }
  // após remover, aceita apenas 10 ou 11 dígitos
  if (digits.length !== 10 && digits.length !== 11) {
    return null;
  }
  const ddd = digits.slice(0, 2);
  if (digits.length === 11) {
    const parteA = digits.slice(2, 7); // 5 dígitos
    const parteB = digits.slice(7);    // 4 dígitos
    return `(${ddd}) ${parteA}-${parteB}`;
  } else {
    // 10 dígitos (sem o 9): (DD) XXXX-XXXX
    const parteA = digits.slice(2, 6); // 4 dígitos
    const parteB = digits.slice(6);    // 4 dígitos
    return `(${ddd}) ${parteA}-${parteB}`;
  }
}

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
    // Define ordem como o próximo número disponível dentro do enterprise
    let ordem = 0;
    try {
      const maxOrdem = await models.ClienteStatus.max('ordem', { where: { enterprise_id: enterpriseId } });
      if (typeof maxOrdem === 'number' && isFinite(maxOrdem)) ordem = maxOrdem + 1;
      else if (maxOrdem != null) {
        const parsed = Number(maxOrdem);
        if (!isNaN(parsed) && isFinite(parsed)) ordem = parsed + 1;
      }
    } catch (_) { ordem = 0; }
    const created = await models.ClienteStatus.create({ enterprise_id: enterpriseId, nome, ordem });
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
      const celular = normalizaCelularBR(row.celular);
      const nomeRaw = row.nome?.trim();
      if (!celular || !nomeRaw) {
        const motivo = !nomeRaw ? 'Falta nome' : 'Celular inválido ou ausente';
        resumo.erros.push({ linha: i + 1, motivo });
        resumo.pulados++;
        continue;
      }

      const dados = { celular, nome: formataTexto(nomeRaw), enterprise_id: enterpriseId };
      if (row.cidade) dados.cidade = formataTexto(row.cidade.trim());
      if (assignUserId) dados.id_usuario = assignUserId;
      if (row.indicacao) dados.indicacao = formataTexto(row.indicacao.trim());

      // STATUS: aceita string (nome) ou id numérico; mantém layout do CSV (coluna 'status')
      if (row.status) {
        const rawStatus = String(row.status).trim();
        const maybeNumber = Number(rawStatus);
        const isNumeric = rawStatus !== '' && !isNaN(maybeNumber);
        if (isNumeric) {
          dados.status = maybeNumber;
          dados.tempo_status = new Date();
        } else {
          const statusNome = formataTexto(rawStatus);
          const lower = statusNome.toLowerCase();
          // Se for "Fechado" (ou similares), marca fechado (coerente com regra do controller)
          if (['fechado', 'concluido', 'concluído', 'fechou'].includes(lower)) {
            dados.fechado = new Date();
          }
          const statusRow = await ensureStatus(enterpriseId, statusNome);
          if (statusRow) dados.status = statusRow.id;
          dados.tempo_status = new Date();
        }
      }

      // CAMPANHA: aceita string (nome) ou id numérico
      if (row.campanha) {
        const rawCamp = String(row.campanha).trim();
        const maybeNumber = Number(rawCamp);
        const isNumeric = rawCamp !== '' && !isNaN(maybeNumber);
        if (isNumeric) {
          dados.campanha = maybeNumber;
        } else {
          const campNome = formataTexto(rawCamp);
          const campanhaRow = await ensureCampanha(enterpriseId, campNome);
          if (campanhaRow) dados.campanha = campanhaRow.id;
        }
      }

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
