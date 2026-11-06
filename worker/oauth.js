// OAuth 2.1 authorization server for the MCP endpoint (MCP spec 2025-06-18):
//   - RFC 9728 protected resource metadata, RFC 8414 authorization server metadata
//   - RFC 7591 dynamic client registration (public clients, PKCE S256 only)
//   - authorization code + refresh token grants, authorization requires the admin password on a consent screen
// Everything is stateless (HMAC-signed tokens derived from SESSION_SECRET) except one tiny D1 table that makes
// authorization codes single-use. Bumping `oauthEpoch` revokes every issued token at once.

import { checkAdminPassword } from './auth.js';
import { getConfigValue, setConfigValue } from './config.js';
import { randomHex, safeEqual, sha256B64Url, signToken, verifyToken } from './crypto.js';
import { HttpError, json } from './http.js';

export const SCOPE = 'mcp';
const ACCESS_TTL = 60 * 60 * 1000;
const REFRESH_TTL = 30 * 24 * 60 * 60 * 1000;
const CODE_TTL = 60 * 1000;
const TXN_TTL = 10 * 60 * 1000;
const CLIENT_TTL = 365 * 24 * 60 * 60 * 1000;

const P = { client: 'oauth-client', txn: 'oauth-txn', code: 'oauth-code', access: 'oauth-access', refresh: 'oauth-refresh' };

const origin = (request) => new URL(request.url).origin;
const noStore = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };

function secretOf(env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 16) throw new HttpError(503, 'OAuth is not configured (SESSION_SECRET is missing)');
  return env.SESSION_SECRET;
}

const getEpoch = async (env) => parseInt((await getConfigValue(env, 'oauthEpoch')) || '0', 10) || 0;

export async function revokeAll(env) {
  await setConfigValue(env, 'oauthEpoch', (await getEpoch(env)) + 1);
}

const oauthError = (status, error, description) => json({ error, error_description: description }, status, noStore);

// ---------- discovery ----------
export function protectedResourceMetadata(request) {
  const o = origin(request);
  return json({
    resource: `${o}/mcp`,
    authorization_servers: [o],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'TETE',
  }, 200, { 'Cache-Control': 'public, max-age=300' });
}

export function authorizationServerMetadata(request) {
  const o = origin(request);
  return json({
    issuer: o,
    authorization_endpoint: `${o}/oauth/authorize`,
    token_endpoint: `${o}/oauth/token`,
    registration_endpoint: `${o}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [SCOPE],
    authorization_response_iss_parameter_supported: true,
  }, 200, { 'Cache-Control': 'public, max-age=300' });
}

// The 401 that makes an MCP client start the OAuth flow.
export function unauthorized(request, invalid = false) {
  const challenge = `Bearer resource_metadata="${origin(request)}/.well-known/oauth-protected-resource", scope="${SCOPE}"${invalid ? ', error="invalid_token"' : ''}`;
  return json({ error: invalid ? 'invalid_token' : 'unauthorized', error_description: 'Authorization required' }, 401, { 'WWW-Authenticate': challenge });
}

// ---------- dynamic client registration (RFC 7591) ----------
function validRedirect(value) {
  try {
    const u = new URL(value);
    if (u.hash) return false;
    if (u.protocol === 'https:') return true;
    return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  } catch {
    return false;
  }
}

// Control characters are dropped; HTML-significant characters are kept and escaped wherever the name is rendered.
const cleanName = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || 'Unnamed application';

export async function register(request, env) {
  let body;
  try { body = await request.json(); } catch { return oauthError(400, 'invalid_client_metadata', 'Body must be JSON'); }
  const uris = Array.isArray(body?.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (uris.length < 1 || uris.length > 5 || !uris.every(validRedirect)) {
    return oauthError(400, 'invalid_redirect_uri', 'redirect_uris must be 1 to 5 https URLs (http only for localhost) without fragments');
  }
  const name = cleanName(body.client_name);
  const now = Date.now();
  const clientId = await signToken({ ru: uris, nm: name, iat: now, exp: now + CLIENT_TTL }, secretOf(env), P.client);
  return json({
    client_id: clientId,
    client_id_issued_at: Math.floor(now / 1000),
    client_name: name,
    redirect_uris: uris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: SCOPE,
  }, 201, noStore);
}

// ---------- consent screen ----------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function page(status, title, body, { formAction = "'self'" } = {}) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<title>${esc(title)} — TETE</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%2314463a'/%3E%3Ccircle cx='16' cy='16' r='11' fill='%2342a583'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,400&family=Geist:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/style.css?v=5">
</head>
<body class="file-page">
<header class="site-header"><div class="wrap header-inner"><a class="wordmark" href="/"><span class="wordmark-mark" aria-hidden="true">t</span><span>TETE</span></a></div></header>
<main><div class="wrap"><div class="panel file-card">${body}</div></div></main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': `default-src 'none'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:; base-uri 'none'; frame-ancestors 'none'; form-action ${formAction}`,
    },
  });
}

const errorPage = (status, message) => page(status, 'Cannot continue', `<h1 class="h2">We cannot continue</h1><p class="muted">${esc(message)}</p><p class="muted">Go back to the application and start the connection again.</p>`);

function consentPage({ txn, client, redirectUri, error }) {
  const ru = new URL(redirectUri);
  const body = `
<p class="eyebrow"><i class="dot"></i>Connect an application</p>
<h1 class="h2">Allow <em class="consent-app">${esc(client)}</em> to manage TETE?</h1>
<p class="muted">This application asked to connect to TETE through MCP. If you allow it, it can:</p>
<ul class="perm-list">
  <li>Upload, read and delete files</li>
  <li>List every file, including other people's</li>
  <li>Read and change limits, and purge expired files</li>
</ul>
<p class="tiny">After approval you will be sent back to <strong>${esc(ru.host)}</strong>. Only continue if you started this connection and trust that application.</p>
<form method="post" action="/oauth/authorize">
  <input type="hidden" name="txn" value="${esc(txn)}">
  <label class="field">
    <span class="label">Admin password</span>
    <input class="input" type="password" name="password" autocomplete="current-password" required autofocus>
  </label>
  ${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ''}
  <div class="actions">
    <button class="btn btn-primary" type="submit" name="decision" value="allow">Allow</button>
    <button class="btn" type="submit" name="decision" value="deny" formnovalidate>Deny</button>
  </div>
</form>
<p class="tiny">You can disconnect every application later from the Admin section of the website.</p>`;
  return page(error ? 401 : 200, 'Authorize', body, { formAction: `'self' ${ru.origin}` });
}

function redirectWith(redirectUri, params, status = 303) {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) u.searchParams.set(k, v);
  return new Response(null, { status, headers: { Location: u.toString(), ...noStore } });
}

// GET /oauth/authorize
export async function authorizeGet(request, env) {
  const q = new URL(request.url).searchParams;
  const client = await verifyToken(q.get('client_id'), secretOf(env), P.client);
  if (!client) return errorPage(400, 'The application is not registered or its registration expired.');
  const redirectUri = q.get('redirect_uri');
  if (!redirectUri || !client.ru.includes(redirectUri)) return errorPage(400, 'The redirect address does not match the application registration.');

  const state = q.get('state') || undefined;
  const iss = origin(request);
  if (q.get('response_type') !== 'code') return redirectWith(redirectUri, { error: 'unsupported_response_type', state, iss }, 302);
  const challenge = q.get('code_challenge');
  if (!challenge || q.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
    return redirectWith(redirectUri, { error: 'invalid_request', error_description: 'PKCE with S256 is required', state, iss }, 302);
  }

  const txn = await signToken({ cid: q.get('client_id'), ru: redirectUri, cc: challenge, st: state, nm: client.nm, exp: Date.now() + TXN_TTL }, secretOf(env), P.txn);
  return consentPage({ txn, client: client.nm, redirectUri });
}

// POST /oauth/authorize (the consent form)
export async function authorizePost(request, env) {
  let form;
  try { form = await request.formData(); } catch { return errorPage(400, 'The form could not be read.'); }
  const txn = await verifyToken(form.get('txn'), secretOf(env), P.txn);
  if (!txn) return errorPage(400, 'This approval request expired. Start the connection again.');
  const iss = origin(request);

  if (form.get('decision') !== 'allow') return redirectWith(txn.ru, { error: 'access_denied', state: txn.st, iss });

  if (!(await checkAdminPassword(env, String(form.get('password') || '')))) {
    return consentPage({ txn: String(form.get('txn')), client: txn.nm, redirectUri: txn.ru, error: 'Wrong password.' });
  }

  const code = await signToken({ cid: txn.cid, ru: txn.ru, cc: txn.cc, jti: randomHex(12), ep: await getEpoch(env), exp: Date.now() + CODE_TTL }, secretOf(env), P.code);
  return redirectWith(txn.ru, { code, state: txn.st, iss });
}

// ---------- token endpoint ----------
async function readParams(request) {
  const type = request.headers.get('Content-Type') || '';
  if (type.includes('application/json')) {
    try { return await request.json(); } catch { return {}; }
  }
  try { return Object.fromEntries((await request.formData()).entries()); } catch { return {}; }
}

async function issueTokens(env, clientId, epoch) {
  const now = Date.now();
  const secret = secretOf(env);
  return {
    access_token: await signToken({ cid: clientId, ep: epoch, exp: now + ACCESS_TTL }, secret, P.access),
    token_type: 'Bearer',
    expires_in: ACCESS_TTL / 1000,
    refresh_token: await signToken({ cid: clientId, ep: epoch, exp: now + REFRESH_TTL }, secret, P.refresh),
    scope: SCOPE,
  };
}

export async function token(request, env) {
  const p = await readParams(request);
  const secret = secretOf(env);
  const epoch = await getEpoch(env);

  if (p.grant_type === 'authorization_code') {
    const code = await verifyToken(p.code, secret, P.code);
    if (!code || code.ep !== epoch) return oauthError(400, 'invalid_grant', 'Invalid or expired authorization code');
    if (code.cid !== p.client_id || code.ru !== p.redirect_uri) return oauthError(400, 'invalid_grant', 'client_id or redirect_uri does not match the authorization request');
    const verifier = String(p.code_verifier || '');
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !safeEqual(await sha256B64Url(verifier), code.cc)) {
      return oauthError(400, 'invalid_grant', 'PKCE verification failed');
    }
    if (!(await verifyToken(code.cid, secret, P.client))) return oauthError(401, 'invalid_client', 'The client registration expired');
    // Single use: the first redemption records the code id, any replay finds it taken.
    const claimed = await env.DB.prepare('INSERT INTO oauth_codes (jti, exp) VALUES (?, ?) ON CONFLICT DO NOTHING').bind(code.jti, code.exp).run();
    if (!claimed.meta.changes) return oauthError(400, 'invalid_grant', 'Authorization code already used');
    return json(await issueTokens(env, code.cid, epoch), 200, noStore);
  }

  if (p.grant_type === 'refresh_token') {
    const refresh = await verifyToken(p.refresh_token, secret, P.refresh);
    if (!refresh || refresh.ep !== epoch) return oauthError(400, 'invalid_grant', 'Invalid or expired refresh token');
    if (p.client_id && p.client_id !== refresh.cid) return oauthError(400, 'invalid_grant', 'client_id does not match the refresh token');
    return json(await issueTokens(env, refresh.cid, epoch), 200, noStore);
  }

  return oauthError(400, 'unsupported_grant_type', 'Use authorization_code or refresh_token');
}

// Used by /mcp: is this Bearer value a live OAuth access token?
export async function isValidAccessToken(bearer, env) {
  if (!env.SESSION_SECRET) return false;
  const payload = await verifyToken(bearer, env.SESSION_SECRET, P.access);
  return !!payload && payload.ep === (await getEpoch(env));
}

export async function purgeOauthCodes(env) {
  await env.DB.prepare('DELETE FROM oauth_codes WHERE exp < ?').bind(Date.now()).run();
}
