// Runtime configuration: wrangler [vars] provide defaults, the admin UI overrides them in D1.

export const HARD_MAX_FILE_BYTES = 50 * 1024 * 1024; // Worker memory (128 MB) is the real ceiling
export const TOTAL_REQUEST_CAP = 60 * 1024 * 1024;
export const ADMIN_SESSION_MS = 24 * 60 * 60 * 1000;

const int = (v, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export function parseWhitelist(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(',');
  return list.map((e) => String(e).trim().toLowerCase().replace(/^\./, '')).filter(Boolean);
}

export function pbkdf2Iterations(env) {
  return int(env.PBKDF2_ITERATIONS, 100000) || 100000;
}

export async function getConfig(env) {
  const cfg = {
    defaultExpiration: int(env.DEFAULT_EXPIRATION_MS, 3600000),
    maxFileSize: int(env.MAX_FILE_SIZE_BYTES, 25 * 1024 * 1024),
    maxFilesPerUpload: int(env.MAX_FILES_PER_UPLOAD, 10) || 10,
    fileWhitelist: parseWhitelist(env.FILE_WHITELIST),
  };
  const { results } = await env.DB.prepare('SELECT key, value FROM config').all();
  for (const { key, value } of results) {
    if (key === 'defaultExpiration' || key === 'maxFileSize' || key === 'maxFilesPerUpload') cfg[key] = int(value, cfg[key]);
    else if (key === 'fileWhitelist') cfg.fileWhitelist = parseWhitelist(value);
  }
  cfg.maxFileSize = Math.min(cfg.maxFileSize, HARD_MAX_FILE_BYTES);
  return cfg;
}

export async function setConfigValue(env, key, value) {
  await env.DB.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, String(value))
    .run();
}

export async function getConfigValue(env, key) {
  const row = await env.DB.prepare('SELECT value FROM config WHERE key = ?').bind(key).first();
  return row ? row.value : null;
}

export function publicConfig(cfg) {
  return {
    defaultExpiration: cfg.defaultExpiration,
    maxFileSize: cfg.maxFileSize,
    maxFileSizeMB: Math.round(cfg.maxFileSize / 1024 / 1024),
    maxFilesPerUpload: cfg.maxFilesPerUpload,
    fileWhitelist: cfg.fileWhitelist,
  };
}
