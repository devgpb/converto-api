const { createClient } = require('@supabase/supabase-js');

// Para evitar colisão com strings de conexão Postgres, usamos BUCKET_URL (ou SUPABASE_PROJECT_URL)
let SUPABASE_PROJECT_URL = process.env.BUCKET_URL || process.env.SUPABASE_PROJECT_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'exports';

function looksLikePostgresUrl(u) {
  return typeof u === 'string' && /^postgres(ql)?:\/\//i.test(u);
}

function isValidHttpUrl(u) {
  return typeof u === 'string' && /^https?:\/\//i.test(u);
}

function normalizeProjectUrl(u) {
  try {
    const parsed = new URL(u);
    // Se veio com caminhos (ex.: /storage/v1/object), fica apenas a origem
    return parsed.origin;
  } catch (_) {
    return u;
  }
}

// Normaliza URL caso inclua sufixos de API de storage
if (SUPABASE_PROJECT_URL && /supabase\.co/i.test(SUPABASE_PROJECT_URL)) {
  const original = SUPABASE_PROJECT_URL;
  SUPABASE_PROJECT_URL = normalizeProjectUrl(SUPABASE_PROJECT_URL);
  if (original !== SUPABASE_PROJECT_URL) {
    console.warn(`[supabase] Normalizando BUCKET_URL: '${original}' -> '${SUPABASE_PROJECT_URL}'`);
  }
}

if (!SUPABASE_PROJECT_URL || !SUPABASE_SERVICE_KEY) {
  console.warn('[supabase] Variáveis BUCKET_URL/SUPABASE_PROJECT_URL e/ou SUPABASE_SERVICE_KEY não configuradas');
}

if (looksLikePostgresUrl(SUPABASE_PROJECT_URL)) {
  console.error('[supabase] BUCKET_URL/SUPABASE_PROJECT_URL aponta para um URL de Postgres. Configure com https://<project>.supabase.co');
}

const supabase = (SUPABASE_PROJECT_URL && SUPABASE_SERVICE_KEY && isValidHttpUrl(SUPABASE_PROJECT_URL) && !looksLikePostgresUrl(SUPABASE_PROJECT_URL))
  ? createClient(SUPABASE_PROJECT_URL, SUPABASE_SERVICE_KEY)
  : null;

async function uploadBuffer(path, buffer, contentType = 'text/csv') {
  if (!supabase) throw new Error('Supabase não configurado');
  try {
    const { data, error } = await supabase
      .storage
      .from(SUPABASE_BUCKET)
      .upload(path, buffer, {
        contentType,
        upsert: false,
      });
    if (error) throw error;
    return data;
  } catch (e) {
    const base = SUPABASE_PROJECT_URL;
    const msg = (e && e.message) ? e.message : String(e);
    console.log(e)
    throw new Error(`[supabase.uploadBuffer] ${msg} (bucket='${SUPABASE_BUCKET}', path='${path}', base='${base}')`);
  }
}

async function removeFile(path) {
  if (!supabase) throw new Error('Supabase não configurado');
  try {
    const { data, error } = await supabase
      .storage
      .from(SUPABASE_BUCKET)
      .remove([path]);
    if (error) throw error;
    return data;
  } catch (e) {
    const base = SUPABASE_PROJECT_URL;
    const msg = (e && e.message) ? e.message : String(e);
    throw new Error(`[supabase.removeFile] ${msg} (bucket='${SUPABASE_BUCKET}', path='${path}', base='${base}')`);
  }
}

async function createSignedUrl(path, expiresInSeconds) {
  if (!supabase) throw new Error('Supabase não configurado');
  try {
    const { data, error } = await supabase
      .storage
      .from(SUPABASE_BUCKET)
      .createSignedUrl(path, expiresInSeconds);
    if (error) throw error;
    return data?.signedUrl;
  } catch (e) {
    const base = SUPABASE_PROJECT_URL;
    const msg = (e && e.message) ? e.message : String(e);
    throw new Error(`[supabase.createSignedUrl] ${msg} (bucket='${SUPABASE_BUCKET}', path='${path}', base='${base}')`);
  }
}

module.exports = {
  supabase,
  SUPABASE_BUCKET,
  uploadBuffer,
  removeFile,
  createSignedUrl,
};
