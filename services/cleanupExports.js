const { supabase, SUPABASE_BUCKET, removeFile } = require('./supabase');

const DEFAULT_TTL_DAYS = parseInt(process.env.EXPORT_FILE_TTL_DAYS || '2', 10);

function getEnvPrefix(input) {
  if (input === 'dev' || input === 'prod') return input;
  return process.env.STORAGE_ENV || (process.env.NODE_ENV === 'production' ? 'prod' : 'dev');
}

// Lista recursivamente todos os arquivos sob um prefixo no bucket
async function listAllFilesUnder(prefix) {
  if (!supabase) throw new Error('Supabase não configurado');
  const results = [];

  async function walk(currentPrefix) {
    const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).list(currentPrefix, { limit: 1000 });
    if (error) throw error;
    for (const item of data || []) {
      // Heurística: se o item possui id/created_at, é arquivo; caso contrário, é pasta
      const isFile = !!item.id || !!item.created_at || (item.name || '').includes('.');
      if (isFile) {
        results.push({
          path: `${currentPrefix}/${item.name}`.replace(/\/+/g, '/'),
          created_at: item.created_at || null,
          updated_at: item.updated_at || null,
          raw: item,
        });
      } else {
        await walk(`${currentPrefix}/${item.name}`.replace(/\/+/g, '/'));
      }
    }
  }

  await walk(prefix.replace(/\/+/g, '/'));
  return results;
}

function isExpired(file, ttlDays) {
  const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  // 1) Tenta usar created_at do storage
  if (file.created_at) {
    const created = Date.parse(file.created_at);
    if (!Number.isNaN(created)) return now - created > ttlMs;
  }

  // 2) Fallback: extrair timestamp do nome do arquivo `clientes_..._<ts>.csv`
  const match = file.path.match(/_(\d{10,})\.csv$/);
  if (match) {
    const ts = parseInt(match[1], 10);
    const created = ts < 1e12 ? ts * 1000 : ts; // aceita segundos ou ms
    return now - created > ttlMs;
  }

  // 3) Sem dados confiáveis, não expira
  return false;
}

async function cleanupExports({ env, ttlDays = DEFAULT_TTL_DAYS, dryRun = false } = {}) {
  const envPrefix = getEnvPrefix(env);
  const root = `exports/${envPrefix}`;

  const files = await listAllFilesUnder(root);
  const expired = files.filter(f => isExpired(f, ttlDays));

  const removed = [];
  const errors = [];
  if (!dryRun) {
    for (const f of expired) {
      try {
        await removeFile(f.path);
        removed.push(f.path);
      } catch (e) {
        errors.push({ path: f.path, error: e.message });
      }
    }
  }

  return {
    env: envPrefix,
    totalFiles: files.length,
    expiredCount: expired.length,
    removedCount: dryRun ? 0 : removed.length,
    removed: dryRun ? [] : removed,
    errors,
    ttlDays,
    dryRun,
  };
}

module.exports = {
  cleanupExports,
  getEnvPrefix,
};

