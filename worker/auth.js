// Anonymous owner identity (cookie) and stateless admin session (signed cookie).

import { ADMIN_SESSION_MS, getConfigValue } from './config.js';
import { parseCookies, serializeCookie } from './http.js';
import { randomHex, safeEqual, sha256Hex, signToken, verifyToken, verifyPassword } from './crypto.js';

const USER_COOKIE = 'tete_uid';
const ADMIN_COOKIE = 'tete_admin';
const USER_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

const isSecure = (request) => new URL(request.url).protocol === 'https:';

function requireSecret(env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 16) return null;
  return env.SESSION_SECRET;
}

// Returns { userId, setCookie } - setCookie is non-null only when a new identity was issued.
export function resolveUser(request) {
  const existing = parseCookies(request)[USER_COOKIE];
  if (existing && /^[a-f0-9]{32}$/.test(existing)) return { userId: existing, setCookie: null };
  const userId = randomHex(16);
  return {
    userId,
    setCookie: serializeCookie(USER_COOKIE, userId, { maxAge: USER_COOKIE_MAX_AGE, secure: isSecure(request) }),
  };
}

export async function isAdmin(request, env) {
  const secret = requireSecret(env);
  if (!secret) return false;
  const token = parseCookies(request)[ADMIN_COOKIE];
  return !!(await verifyToken(token, secret));
}

export async function adminSessionCookie(request, env) {
  const token = await signToken({ role: 'admin', exp: Date.now() + ADMIN_SESSION_MS }, requireSecret(env));
  return serializeCookie(ADMIN_COOKIE, token, { maxAge: ADMIN_SESSION_MS / 1000, secure: isSecure(request) });
}

export function clearAdminCookie(request) {
  return serializeCookie(ADMIN_COOKIE, '', { maxAge: 0, secure: isSecure(request) });
}

export function adminConfigured(env) {
  return !!requireSecret(env);
}

// Order: password changed via UI (hash in D1) -> initial ADMIN_PASSWORD secret.
export async function checkAdminPassword(env, password) {
  if (!password) return false;
  const stored = await getConfigValue(env, 'adminPasswordHash');
  if (stored) return verifyPassword(password, stored);
  if (!env.ADMIN_PASSWORD) return false;
  return safeEqual(await sha256Hex(password), await sha256Hex(env.ADMIN_PASSWORD));
}
