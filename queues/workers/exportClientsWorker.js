const { Worker } = require('bullmq');
const path = require('path');
const connection = require('../../services/redis');
const models = require('../../models');
const { uploadBuffer, createSignedUrl, SUPABASE_BUCKET } = require('../../services/supabase');

// Configuração de retenção no topo do arquivo (em dias)
const EXPORT_FILE_TTL_DAYS = 2;

function toCsvValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function rowsToCsv(rows) {
  const headers = [
    'id_cliente', 'id_usuario', 'enterprise_id', 'nome', 'celular',
    'cidade', 'status', 'indicacao', 'campanha', 'observacao',
    'fechado', 'tempo_status', 'ultimo_contato', 'orcamento_enviado',
    'created_at', 'updated_at'
  ];
  const lines = [];
  lines.push(headers.join(','));
  for (const r of rows) {
    const line = [
      r.id_cliente,
      r.id_usuario,
      r.enterprise_id,
      r.nome,
      r.celular,
      r.cidade,
      r.status,
      r.indicacao,
      r.campanha,
      r.observacao,
      r.fechado ? new Date(r.fechado).toISOString() : '',
      r.tempo_status ? new Date(r.tempo_status).toISOString() : '',
      r.ultimo_contato ? new Date(r.ultimo_contato).toISOString() : '',
      r.orcamento_enviado === true ? 'true' : r.orcamento_enviado === false ? 'false' : '',
      r.created_at ? new Date(r.created_at).toISOString() : '',
      r.updated_at ? new Date(r.updated_at).toISOString() : '',
    ].map(toCsvValue).join(',');
    lines.push(line);
  }
  return lines.join('\n');
}

async function processExport(job) {
  const { exportScope, enterpriseId, targetUserId, userId, requesterRole } = job.data || {};

  // Segurança no worker: reforça permissão
  if (exportScope === 'enterprise' && requesterRole !== 'admin') {
    throw new Error('Permissão negada: apenas admin exporta todos os clientes da empresa');
  }

  const where = { deleted_at: null };
  if (exportScope === 'enterprise') {
    if (!enterpriseId) throw new Error('enterpriseId ausente para exportação por empresa');
    where.enterprise_id = enterpriseId;
  } else {
    if (!targetUserId) throw new Error('targetUserId ausente para exportação por usuário');
    where.id_usuario = targetUserId;
  }

  // Busca clientes (paranoid true por padrão já ignora deleted_at)
  const clientes = await models.Clientes.findAll({
    where,
    order: [['created_at', 'ASC']],
  });

  const plain = clientes.map(c => c.get({ plain: true }));
  const csv = rowsToCsv(plain);
  const buffer = Buffer.from(csv, 'utf8');

  const envPrefix = process.env.STORAGE_ENV || (process.env.NODE_ENV === 'production' ? 'prod' : 'dev');
  const baseDir = `exports/${envPrefix}/${enterpriseId || 'no-enterprise'}`;
  const filename = `clientes_${exportScope}_${Date.now()}.csv`;
  const objectPath = path.posix.join(baseDir, filename);

  await uploadBuffer(objectPath, buffer, 'text/csv; charset=utf-8');

  const expiresSeconds = EXPORT_FILE_TTL_DAYS * 24 * 60 * 60;
  const signedUrl = await createSignedUrl(objectPath, expiresSeconds);

  return {
    bucket: SUPABASE_BUCKET,
    path: objectPath,
    signedUrl,
    expiresInSeconds: expiresSeconds,
    expiresAt: new Date(Date.now() + expiresSeconds * 1000).toISOString(),
    count: plain.length,
    scope: exportScope,
  };
}

const worker = new Worker('export-clients', async job => {
  if (job.name === 'export') {
    return await processExport(job);
  }
  throw new Error(`Nome de job não suportado: ${job.name}`);
}, { connection });

worker.on('failed', (job, err) => {
  try {
    console.error('[worker:export-clients] Job FAILED', {
      id: job?.id,
      name: job?.name,
      queue: job?.queueName,
      data: job?.data, // log completo para diagnóstico interno
      message: err?.message,
      stack: err?.stack,
    });
  } catch (e) {
    console.error('[worker:export-clients] Job FAILED (log error)', err);
  }
});

worker.on('completed', (job, result) => {
  try {
    console.log('[worker:export-clients] Job COMPLETED', {
      id: job?.id,
      name: job?.name,
      queue: job?.queueName,
      result: {
        path: result?.path,
        expiresAt: result?.expiresAt,
        count: result?.count,
        scope: result?.scope,
      }
    });
  } catch (_) {}
});

module.exports = worker;
