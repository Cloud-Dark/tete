// Admin endpoints: login/logout/status, password change, runtime config.

import {
  adminConfigured, adminSessionCookie, checkAdminPassword, clearAdminCookie,
} from './auth.js';
import {
  HARD_MAX_FILE_BYTES, getConfig, parseWhitelist, pbkdf2Iterations, publicConfig, setConfigValue,
} from './config.js';
import { hashPassword } from './crypto.js';
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

  if (body.defaultExpiration !== undefined) {
    await setConfigValue(env, 'defaultExpiration', toNonNegativeInt(body.defaultExpiration, 'defaultExpiration'));
  }
  if (body.maxFileSize !== undefined) {
    const n = toNonNegativeInt(body.maxFileSize, 'maxFileSize');
    const bytes = n > 1000 ? n : n * 1024 * 1024; // values <= 1000 are interpreted as MB
    if (bytes === 0 || bytes > HARD_MAX_FILE_BYTES) {
      throw new HttpError(400, `maxFileSize must be between 1 and ${HARD_MAX_FILE_BYTES / 1024 / 1024} MB`);
    }
    await setConfigValue(env, 'maxFileSize', bytes);
  }
  if (body.maxFilesPerUpload !== undefined) {
    const n = toNonNegativeInt(body.maxFilesPerUpload, 'maxFilesPerUpload');
    if (n < 1) throw new HttpError(400, 'maxFilesPerUpload must be at least 1');
    await setConfigValue(env, 'maxFilesPerUpload', n);
  }
  if (body.fileWhitelist !== undefined) {
    await setConfigValue(env, 'fileWhitelist', parseWhitelist(body.fileWhitelist).join(','));
  }
  return json(publicConfig(await getConfig(env)));
}
