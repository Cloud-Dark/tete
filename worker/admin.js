// Admin endpoints: login/logout/status, password change, runtime config.

import {
  adminConfigured, adminSessionCookie, checkAdminPassword, clearAdminCookie,
} from './auth.js';
import {
  HARD_MAX_FILE_BYTES, getConfig, parseWhitelist, pbkdf2Iterations, publicConfig, setConfigValue, storageQuota,
} from './config.js';
import { hashPassword } from './crypto.js';
import { revokeAll } from './oauth.js';
import { bucketUsage } from './storage.js';
import { HttpError, json, readJson } from './http.js';

const MIN_PASSWORD_LENGTH = 8;

function requireAdmin(ctx) {
  if (!ctx.isAdmin) throw new HttpError(403, 'Admin access required');
}

export async function login(request, env) {
  if (!adminConfigured(env)) throw new HttpError(503, 'Admin is not configured (set the SESSION_SECRET secret)');
  const { password } = await readJson(request);
  if (!password) throw new HttpError(400, 'Password required');
  if (!(await checkAdminPassword(env, String(password)))) throw new HttpError(401, 'Invalid password');
  return json({ success: true, message: 'Login successful' }, 200, { 'Set-Cookie': await adminSessionCookie(request, env) });
}

export function logout(request) {
  return json({ success: true, message: 'Logout successful' }, 200, { 'Set-Cookie': clearAdminCookie(request) });
}

export function status(ctx) {
  return json({ isAdmin: ctx.isAdmin });
}

export async function verifyPassword(request, env, ctx) {
  requireAdmin(ctx);
  const { password } = await readJson(request);
  if (!password) throw new HttpError(400, 'Password required');
  if (!(await checkAdminPassword(env, String(password)))) throw new HttpError(401, 'Invalid password');
  return json({ success: true, message: 'Password verified' });
}

export async function changePassword(request, env, ctx) {
  requireAdmin(ctx);
  const { newPassword } = await readJson(request);
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  await setConfigValue(env, 'adminPasswordHash', await hashPassword(newPassword, pbkdf2Iterations(env)));
  return json({ success: true, message: 'Password changed successfully' });
}

export async function getConfigHandler(env, ctx) {
  requireAdmin(ctx);
  return json(publicConfig(await getConfig(env)));
}

const toNonNegativeInt = (value, field) => {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${field} must be a non-negative number`);
  return n;
};

export async function updateConfig(request, env, ctx) {
  requireAdmin(ctx);
  const body = await readJson(request);

  // Validate everything first, then write: a rejected request must not change anything.
  const next = {};
  if (body.defaultExpiration !== undefined) {
    next.defaultExpiration = toNonNegativeInt(body.defaultExpiration, 'defaultExpiration');
  }
  if (body.maxFileSize !== undefined) {
    const n = toNonNegativeInt(body.maxFileSize, 'maxFileSize');
    const bytes = n > 1000 ? n : n * 1024 * 1024; // values <= 1000 are interpreted as MB
    if (bytes === 0 || bytes > HARD_MAX_FILE_BYTES) {
      throw new HttpError(400, `maxFileSize must be between 1 and ${HARD_MAX_FILE_BYTES / 1024 / 1024} MB`);
    }
    next.maxFileSize = bytes;
  }
  if (body.maxFilesPerUpload !== undefined) {
    const n = toNonNegativeInt(body.maxFilesPerUpload, 'maxFilesPerUpload');
    if (n < 1) throw new HttpError(400, 'maxFilesPerUpload must be at least 1');
    next.maxFilesPerUpload = n;
  }
  if (body.fileWhitelist !== undefined) {
    next.fileWhitelist = parseWhitelist(body.fileWhitelist).join(',');
  }

  for (const [key, value] of Object.entries(next)) await setConfigValue(env, key, value);
  return json(publicConfig(await getConfig(env)));
}

// Signs out every MCP client that connected through OAuth (their access and refresh tokens stop working at once).
export async function revokeOauth(env, ctx) {
  requireAdmin(ctx);
  await revokeAll(env);
  return json({ success: true, message: 'All connected applications were signed out' });
}

// GET /api/admin/stats - one aggregate query over live files.
export async function stats(env, ctx) {
  requireAdmin(ctx);
  const now = Date.now();
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS files,
            COALESCE(SUM(size), 0) AS bytes,
            COALESCE(SUM(locked), 0) AS locked,
            COALESCE(SUM(CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END), 0) AS never,
            COALESCE(SUM(CASE WHEN expires_at IS NOT NULL AND expires_at < ? THEN 1 ELSE 0 END), 0) AS soon,
            COALESCE(SUM(CASE WHEN uploaded_at > ? THEN 1 ELSE 0 END), 0) AS last24,
            COALESCE(MAX(size), 0) AS largest
     FROM files WHERE expires_at IS NULL OR expires_at > ?`,
  ).bind(now + 3600000, new Date(now - 86400000).toISOString(), now).first();
  return json({
    files: Number(row.files),
    bytes: Number(row.bytes),
    locked: Number(row.locked),
    public: Number(row.files) - Number(row.locked),
    neverExpire: Number(row.never),
    expiringWithinHour: Number(row.soon),
    uploadedLast24h: Number(row.last24),
    largestBytes: Number(row.largest),
  });
}

// GET /api/admin/storage - what Supabase itself reports for the bucket, against the configured quota.
// Cached for 20 s per instance because it lists the bucket page by page.
let storageCache = null;
export async function storageStatus(env, ctx, { fresh = false } = {}) {
  requireAdmin(ctx);
  if (!fresh && storageCache && storageCache.expires > Date.now()) return json(storageCache.value);
  const usage = await bucketUsage(env);
  const quotaBytes = storageQuota(env);
  const value = {
    source: 'supabase',
    bucket: 'tete',
    objects: usage.objects,
    usedBytes: usage.bytes,
    quotaBytes,
    remainingBytes: Math.max(quotaBytes - usage.bytes, 0),
    truncated: usage.truncated,
    checkedAt: new Date().toISOString(),
    note: 'Used bytes are summed from the objects in the TETE bucket. Other buckets in the same Supabase project, and the plan limit itself, are not included; set STORAGE_QUOTA_BYTES to the real allowance.',
  };
  storageCache = { value, expires: Date.now() + 20_000 };
  return json(value);
}
