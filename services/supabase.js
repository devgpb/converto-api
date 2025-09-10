const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'exports';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  // Não lançar erro aqui para não quebrar o boot; os workers/rotas validarão ao usar
  console.warn('[supabase] Variáveis SUPABASE_URL/SUPABASE_SERVICE_KEY não configuradas');
}

const supabase = (SUPABASE_URL && SUPABASE_SERVICE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

async function uploadBuffer(path, buffer, contentType = 'text/csv') {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .storage
    .from(SUPABASE_BUCKET)
    .upload(path, buffer, {
      contentType,
      upsert: false,
    });
  if (error) throw error;
  return data;
}

async function removeFile(path) {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .storage
    .from(SUPABASE_BUCKET)
    .remove([path]);
  if (error) throw error;
  return data;
}

async function createSignedUrl(path, expiresInSeconds) {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .storage
    .from(SUPABASE_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data?.signedUrl;
}

module.exports = {
  supabase,
  SUPABASE_BUCKET,
  uploadBuffer,
  removeFile,
  createSignedUrl,
};

