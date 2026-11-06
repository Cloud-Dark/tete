// End-to-end smoke test. Usage: BASE_URL=http://localhost:8787 ADMIN_PASSWORD=... node test/smoke.mjs
// When the API and the frontend are different hosts, also set FRONTEND_URL (e.g. BASE_URL=https://tetein.apipedia.id
// FRONTEND_URL=https://tete.apipedia.id); it defaults to BASE_URL. Set MCP_TOKEN to also test the admin MCP tools.
// Works against `wrangler dev` or a deployed Worker.

const BASE = (process.env.BASE_URL || 'http://localhost:8787').replace(/\/$/, '');
const FRONT = (process.env.FRONTEND_URL || BASE).replace(/\/$/, '');
const MCP_TOKEN = process.env.MCP_TOKEN || ''; // optional: enables the admin MCP tool checks
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'local-admin-pass';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`);
  if (!ok) failed++;
};

// Minimal cookie jar so each "client" keeps its own identity.
const makeClient = () => {
  const jar = new Map();
  return async (path, init = {}) => {
    const headers = new Headers(init.headers);
    if (jar.size) headers.set('Cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
    const res = await fetch(BASE + path, { ...init, headers, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const [k, v] = [pair.slice(0, i), pair.slice(i + 1)];
      if (/Max-Age=0/i.test(c)) jar.delete(k); else jar.set(k, v);
    }
    return res;
  };
};

const alice = makeClient();
const bob = makeClient();
const postJson = (c, path, body) => c(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// --- basics
let res = await alice('/api');
check('GET /api returns endpoint index', res.status === 200 && (await res.json()).endpoints?.upload);

// --- unlocked text upload / info / download
res = await postJson(alice, '/api/text', { text: 'hello tete', filename: 'hi.txt' });
const text = await res.json();
check('POST /api/text -> 200 with id', res.status === 200 && /^[a-f0-9]{6}$/.test(text.id), JSON.stringify(text));
check('upload returns deleteUrl with token', /\?token=[a-f0-9]{32}$/.test(text.deleteUrl || ''));

res = await alice(`/api/file/${text.id}`);
const info = await res.json();
check('GET /api/file/:id -> metadata', res.status === 200 && info.originalName === 'hi.txt' && !info.locked && !('deleteToken' in info));

res = await alice(`/file/${text.id}/download`);
check('download unlocked text', res.status === 200 && (await res.text()) === 'hello tete' && /attachment; filename="hi.txt"/.test(res.headers.get('Content-Disposition')));

res = await alice(`/file/${text.id}`, { headers: { Accept: '*/*' } });
check('GET /file/:id with Accept */* returns JSON (curl)', (res.headers.get('Content-Type') || '').includes('json'));

res = await fetch(`${FRONT}/file/${text.id}`, { headers: { Accept: 'text/html', 'Sec-Fetch-Dest': 'document' } });
const html = await res.text();
check('GET /file/:id from browser serves file-view page', res.status === 200 && html.includes('id="fileInfo"'), `${res.status} ${html.slice(0, 80)}`);

// --- multipart upload (binary-safe)
const bytes = new Uint8Array(70000).map((_, i) => i % 251);
let form = new FormData();
form.append('file', new Blob([bytes], { type: 'application/octet-stream' }), 'blob.bin');
res = await alice('/api', { method: 'POST', body: form });
const bin = await res.json();
check('POST /api multipart (field file)', res.status === 200 && bin.size === 70000, JSON.stringify(bin));
const dl = new Uint8Array(await (await alice(`/file/${bin.id}/download`)).arrayBuffer());
check('binary download is byte-identical', dl.length === bytes.length && dl.every((b, i) => b === bytes[i]));

form = new FormData();
form.append('files', new Blob(['a']), 'a.txt');
form.append('files', new Blob(['b']), 'b.txt');
res = await alice('/api/upload', { method: 'POST', body: form });
const multi = await res.json();
check('POST /api/upload multiple files -> array', res.status === 200 && Array.isArray(multi) && multi.length === 2);

// --- locked (encrypted) upload
form = new FormData();
form.append('file', new Blob(['top secret'], { type: 'text/plain' }), 'secret.txt');
form.append('password', 'pw-123');
res = await alice('/api', { method: 'POST', body: form });
const locked = await res.json();
check('locked upload -> locked+encrypted, name returned to uploader', res.status === 200 && locked.locked && locked.encrypted && locked.originalName === 'secret.txt', JSON.stringify(locked));

const pub = await (await bob(`/api/file/${locked.id}`)).json();
check('public info hides real filename of locked file', pub.locked === true && pub.originalName === `${locked.id}.enc`, JSON.stringify(pub));

res = await bob(`/file/${locked.id}/download`);
check('locked download without password -> 401', res.status === 401);
res = await bob(`/file/${locked.id}/download?password=wrong`);
check('locked download wrong password -> 401', res.status === 401);
res = await bob(`/file/${locked.id}/download?password=pw-123`);
check('locked download right password decrypts + restores name', res.status === 200 && (await res.text()) === 'top secret' && /filename="secret.txt"/.test(res.headers.get('Content-Disposition')));
res = await postJson(bob, `/file/${locked.id}/verify`, { password: 'nope' });
check('verify wrong password -> 401', res.status === 401);
res = await postJson(bob, `/file/${locked.id}/verify`, { password: 'pw-123' });
check('verify right password -> 200', res.status === 200);

// --- listing is per-owner
const mine = await (await alice('/api/files')).json();
const theirs = await (await bob('/api/files')).json();
check('list: owner sees own files', mine.some((f) => f.id === text.id));
check('list: other user does not see them', !theirs.some((f) => f.id === text.id));

// --- delete authorization
res = await bob(`/file/${text.id}`, { method: 'DELETE' });
check('delete by stranger -> 403', res.status === 403);
res = await bob(`/file/${text.id}?token=${text.deleteUrl.split('token=')[1]}`, { method: 'DELETE' });
check('delete with token -> 200', res.status === 200);
res = await alice(`/api/file/${text.id}`);
check('deleted file -> 404', res.status === 404);
res = await alice(`/file/${bin.id}`, { method: 'DELETE' });
check('owner (cookie) can delete', res.status === 200);

// --- expiration
res = await postJson(alice, '/api/text', { text: 'short lived', expiration: 1000 });
const shortLived = await res.json();
await new Promise((r) => setTimeout(r, 1500));
res = await alice(`/api/file/${shortLived.id}`);
check('expired file -> 404', res.status === 404);

// --- validation
res = await alice('/api/text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
check('text without content -> 400', res.status === 400);
res = await alice('/api', { method: 'POST', body: new FormData() });
check('upload without file -> 400', res.status === 400);
res = await alice('/file/zzzzzz/download');
check('bad id -> 404', res.status === 404);
const MB5 = 5 * 1024 * 1024;
const exact = new FormData();
exact.append('file', new Blob([new Uint8Array(MB5)]), 'exact-5mb.bin');
res = await alice('/api', { method: 'POST', body: exact });
const exactJson = res.status === 200 ? await res.json() : null;
check('a file of exactly 5 MB is accepted', res.status === 200 && exactJson.size === MB5, String(res.status));
if (exactJson) {
  const back = await alice(`/file/${exactJson.id}/download`);
  check('the 5 MB file downloads with the same size', back.status === 200 && (await back.arrayBuffer()).byteLength === MB5);
  await alice(`/file/${exactJson.id}`, { method: 'DELETE' });
}
const over = new FormData();
over.append('file', new Blob([new Uint8Array(MB5 + 1)]), 'over-5mb.bin');
res = await alice('/api', { method: 'POST', body: over });
check('5 MB + 1 byte -> 413 mentioning the 5 MB limit', res.status === 413 && /5 MB/.test((await res.json()).error), String(res.status));
const big = new FormData();
big.append('file', new Blob([new Uint8Array(26 * 1024 * 1024)]), 'big.bin');
res = await alice('/api', { method: 'POST', body: big });
check('26 MB file -> 413', res.status === 413, String(res.status));
const bigText = await postJson(alice, '/api/text', { text: 'x'.repeat(MB5 + 1) });
check('text above 5 MB -> 413', bigText.status === 413, String(bigText.status));

// --- resources (usage endpoint)
res = await alice('/api/usage');
const u0 = await res.json();
check('GET /api/usage: shape, 5 MB per-file limit, remaining = quota - used', res.status === 200 && u0.limits.maxFileSize === MB5 && u0.storage.remainingBytes === Math.max(u0.storage.quotaBytes - u0.storage.usedBytes, 0) && u0.storage.quotaBytes > 0, JSON.stringify(u0));
check('usage exposes aggregates only (no file names)', !JSON.stringify(u0).includes('.txt') && Object.keys(u0.storage).sort().join() === 'files,quotaBytes,remainingBytes,usedBytes');
const usedFile = await postJson(alice, '/api/text', { text: 'x'.repeat(1000), expiration: 0 });
const uj = await usedFile.json();
await new Promise((r) => setTimeout(r, 200));
const u1 = await (await alice('/api/usage')).json();
check('usage grows after an upload (same instance sees it at once)', u1.storage.usedBytes >= u0.storage.usedBytes || u1.storage.files >= u0.storage.files, JSON.stringify([u0.storage, u1.storage]));
await alice(`/file/${uj.id}`, { method: 'DELETE' });

// --- admin
res = await alice('/api/config');
check('config without admin -> 403', res.status === 403);
res = await postJson(alice, '/api/admin/login', { password: 'wrong' });
check('admin login wrong -> 401', res.status === 401);
res = await postJson(alice, '/api/admin/login', { password: ADMIN_PASSWORD });
check('admin login ok -> 200 + cookie', res.status === 200, String(res.status));
res = await alice('/api/admin/status');
check('admin status true', (await res.json()).isAdmin === true);
res = await alice('/api/config');
const cfg = await res.json();
check('admin can read config', res.status === 200 && cfg.maxFilesPerUpload >= 1, JSON.stringify(cfg));
res = await postJson(alice, '/api/config', { maxFileSize: 6 });
check('admin cannot raise the per-file limit above 5 MB', res.status === 400 && /between 1 and 5 MB/.test((await res.json()).error));
res = await postJson(alice, '/api/config', { fileWhitelist: 'txt,png' });
check('admin can update whitelist', (await res.json()).fileWhitelist.join() === 'txt,png');
const cfgBefore = await (await alice('/api/config')).json();
res = await postJson(alice, '/api/config', { defaultExpiration: 5000, maxFileSize: 0 });
const cfgAfter = await (await alice('/api/config')).json();
check('rejected config update changes nothing (atomic)', res.status === 400 && cfgAfter.defaultExpiration === cfgBefore.defaultExpiration, `${res.status} ${cfgBefore.defaultExpiration} -> ${cfgAfter.defaultExpiration}`);
// The whitelist reaches other instances within the 60 s config cache, so retry until a probe is rejected
// (instant locally); an accidental success is deleted again so no test file is left behind.
for (let i = 0; i < 40; i++) {
  form = new FormData();
  form.append('file', new Blob(['x']), 'bad.exe');
  res = await alice('/api', { method: 'POST', body: form });
  if (res.status === 400) break;
  if (res.status === 200) { const leaked = await res.json(); await alice(`/file/${leaked.id}`, { method: 'DELETE' }); }
  await new Promise((r) => setTimeout(r, 2000));
}
check('whitelist rejects .exe -> 400', res.status === 400, String(res.status));
await postJson(alice, '/api/config', { fileWhitelist: '' });
// Config is cached per isolate for up to 60 s, so on a deployed Worker the reset reaches other isolates a little
// later. Wait until uploads are accepted again (instant locally) before continuing.
for (let i = 0, ok = 0; i < 40 && ok < 3; i++) {
  const probe = new FormData();
  probe.append('file', new Blob(['x']), 'probe.bin');
  const r = await alice('/api', { method: 'POST', body: probe });
  if (r.status === 200) { ok++; await alice(`/file/${(await r.json()).id}`, { method: 'DELETE' }); } else { ok = 0; await new Promise((x) => setTimeout(x, 2000)); }
}
const all = await (await alice('/api/files')).json();
check('admin list sees all users files', all.some((f) => f.id === locked.id));
res = await postJson(alice, '/api/admin/logout', {});
res = await alice('/api/admin/status');
check('admin logout clears session', (await res.json()).isAdmin === false);


// --- MCP (/mcp)
const rpc = async (method, params, id = 1) => {
  const r = await fetch(`${BASE}/mcp/public`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', method: method, id, params }) });
  return { status: r.status, body: r.status === 202 ? null : await r.json() };
};
const tool = async (name, args) => {
  const { body } = await rpc('tools/call', { name, arguments: args });
  const text = body.result.content[0].text;
  return { isError: body.result.isError, text, data: body.result.isError ? null : JSON.parse(text) };
};
let m = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } });
check('MCP initialize negotiates version', m.body.result.protocolVersion === '2025-06-18' && m.body.result.serverInfo.name === 'tete');
res = await fetch(`${BASE}/mcp/public`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
check('MCP notification -> 202', res.status === 202);
m = await rpc('tools/list');
check('MCP tools/list exposes 5 tools', m.body.result.tools.length === 5);
const up = await tool('upload_text', { text: 'via mcp', filename: 'mcp.txt', password: 'mcp-pw' });
check('MCP public: upload_text (locked) returns share link on the frontend origin', !up.isError && up.data.url === `${FRONT}/file/${up.data.id}` && up.data.deleteToken, up.text);
const rd = await tool('read_text', { id: up.data.id, password: 'mcp-pw' });
check('MCP read_text decrypts', !rd.isError && rd.data.text === 'via mcp', rd.text);
const rdBad = await tool('read_text', { id: up.data.id, password: 'nope' });
check('MCP read_text wrong password -> tool error', rdBad.isError === true && /Invalid password/.test(rdBad.text));
const b64 = await tool('upload_base64', { filename: 'b.bin', content_base64: Buffer.from('binary!').toString('base64'), expiration_ms: 0 });
check('MCP upload_base64 (never expires)', !b64.isError && b64.data.size === 7 && b64.data.expiresAt === null, b64.text);
const fi = await tool('file_info', { id: b64.data.id });
check('MCP file_info', !fi.isError && fi.data.originalName === 'b.bin');
const dBad = await tool('delete_file', { id: b64.data.id, token: 'wrong' });
check('MCP delete_file bad token -> tool error', dBad.isError === true);
const dOk = await tool('delete_file', { id: b64.data.id, token: b64.data.deleteToken });
check('MCP delete_file with token', !dOk.isError && dOk.data.success === true);
res = await fetch(`${BASE}/mcp/public`);
check('GET /mcp/public -> 405', res.status === 405);
m = await rpc('nope/method');
check('MCP unknown method -> JSON-RPC error', m.body.error?.code === -32601);

// --- MCP admin tools (only when MCP_TOKEN is provided)
if (MCP_TOKEN) {
  const rpcAs = async (token, method, params) => {
    const r = await fetch(`${BASE}${token ? '/mcp' : '/mcp/public'}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    return { status: r.status, body: await r.json() };
  };
  const callAs = async (token, name, args = {}) => {
    const { body } = await rpcAs(token, 'tools/call', { name, arguments: args });
    const text = body.result.content[0].text;
    return { isError: body.result.isError, text, data: body.result.isError ? null : JSON.parse(text) };
  };
  let r2 = await rpcAs(MCP_TOKEN, 'tools/list');
  check('MCP static token on /mcp: admin tools are listed (9 tools)', r2.body.result.tools.length === 9 && r2.body.result.tools.some((t) => t.name === 'purge_expired'), String(r2.body.result?.tools?.length));
  r2 = await rpcAs('', 'tools/list');
  check('MCP /mcp/public: only the 5 public tools', r2.body.result.tools.length === 5);
  r2 = await rpcAs('definitely-wrong', 'tools/list');
  check('MCP /mcp with a wrong token -> 401 invalid_token', r2.status === 401 && r2.body.error === 'invalid_token');
  const denied = await callAs('', 'list_files');
  check('MCP admin tool on /mcp/public -> tool error', denied.isError === true && /signing in/.test(denied.text), denied.text);

  const seed = await callAs('', 'upload_text', { text: 'seed for admin tools', filename: 'seed.txt' });
  const listed = await callAs(MCP_TOKEN, 'list_files');
  check('MCP list_files sees files of every owner', Array.isArray(listed.data) && listed.data.some((f) => f.id === seed.data.id), listed.text.slice(0, 120));
  const cfg0 = await callAs(MCP_TOKEN, 'get_config');
  check('MCP get_config', cfg0.data.maxFilesPerUpload >= 1, cfg0.text);
  const changed = await callAs(MCP_TOKEN, 'update_config', { maxFilesPerUpload: 7 });
  check('MCP update_config applies', changed.data.maxFilesPerUpload === 7, changed.text);
  await callAs(MCP_TOKEN, 'update_config', { maxFilesPerUpload: cfg0.data.maxFilesPerUpload });
  const purged = await callAs(MCP_TOKEN, 'purge_expired');
  check('MCP purge_expired returns a count', typeof purged.data.purged === 'number', purged.text);
  const del = await callAs(MCP_TOKEN, 'delete_file', { id: seed.data.id });
  check('MCP delete_file without per-file token (admin)', del.data?.success === true, del.text);
  const gone = await callAs('', 'file_info', { id: seed.data.id });
  check('deleted file is gone', gone.isError === true);
}

// --- OAuth 2.1 for /mcp (discovery, dynamic registration, consent, PKCE, tokens)
{
  const { createHash, randomBytes } = await import('node:crypto');
  const b64url = (buf) => Buffer.from(buf).toString('base64url');
  const noFollow = (path, init = {}) => fetch(BASE + path, { redirect: 'manual', ...init });
  const form = (obj) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(obj).toString() });
  const REDIRECT = 'http://localhost:7777/callback';
  const mcpCall = async (accessToken, method, params, id = 1) => {
    const r = await fetch(`${BASE}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  let r = await noFollow('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) });
  const challenge = r.headers.get('www-authenticate') || '';
  check('OAuth: /mcp without credentials -> 401 with resource_metadata hint', r.status === 401 && /Bearer resource_metadata="[^"]+\/\.well-known\/oauth-protected-resource"/.test(challenge), `${r.status} ${challenge}`);
  r = await noFollow('/mcp');
  check('OAuth: unauthenticated GET /mcp -> 401 too', r.status === 401);

  const prm = await (await noFollow('/.well-known/oauth-protected-resource')).json();
  check('OAuth: protected resource metadata points at /mcp and this server', prm.resource === `${BASE}/mcp` && prm.authorization_servers?.[0] === BASE, JSON.stringify(prm));
  const asm = await (await noFollow('/.well-known/oauth-authorization-server')).json();
  check('OAuth: server metadata (S256 only, public clients, registration)', asm.issuer === BASE && asm.authorization_endpoint === `${BASE}/oauth/authorize` && asm.token_endpoint === `${BASE}/oauth/token` && asm.registration_endpoint === `${BASE}/oauth/register` && asm.code_challenge_methods_supported?.join() === 'S256' && asm.token_endpoint_auth_methods_supported?.join() === 'none', JSON.stringify(asm));

  const reg = async (body) => noFollow('/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  r = await reg({ client_name: 'Smoke <b>Client</b>', redirect_uris: [REDIRECT] });
  const client = await r.json();
  check('OAuth: dynamic client registration -> 201 client_id', r.status === 201 && typeof client.client_id === 'string' && client.token_endpoint_auth_method === 'none', JSON.stringify(client));
  r = await reg({ client_name: 'x', redirect_uris: ['javascript:alert(1)'] });
  check('OAuth: javascript: redirect URI rejected', r.status === 400 && (await r.json()).error === 'invalid_redirect_uri');
  r = await reg({ client_name: 'x', redirect_uris: ['http://evil.example/cb'] });
  check('OAuth: plain http redirect to a remote host rejected', r.status === 400);

  const authorizeUrl = (extra = {}, challenge = null) => {
    const q = new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, state: 'st-123', scope: 'mcp', ...(challenge ? { code_challenge: challenge, code_challenge_method: 'S256' } : {}), ...extra });
    return `/oauth/authorize?${q}`;
  };
  const newPkce = () => { const verifier = b64url(randomBytes(32)); return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()) }; };

  // consent screen
  const pk = newPkce();
  r = await noFollow(authorizeUrl({}, pk.challenge));
  let html = await r.text();
  const txn = (html.match(/name="txn" value="([^"]+)"/) || [])[1];
  check('OAuth: consent screen renders, client name escaped, framing denied', r.status === 200 && html.includes('Allow') && html.includes('&lt;b&gt;Client&lt;/b&gt;') && !html.includes('<b>Client</b>') && (r.headers.get('content-security-policy') || '').includes("frame-ancestors 'none'") && !!txn, `${r.status}`);
  r = await noFollow(authorizeUrl({ redirect_uri: 'http://localhost:9999/other' }, pk.challenge));
  check('OAuth: unregistered redirect_uri shows an error page and does NOT redirect', r.status === 400 && !r.headers.get('location'));
  r = await noFollow(authorizeUrl({ client_id: 'garbage' }, pk.challenge));
  check('OAuth: unknown client_id shows an error page', r.status === 400 && !r.headers.get('location'));
  r = await noFollow(authorizeUrl({}, null));
  check('OAuth: missing PKCE challenge redirects with invalid_request', r.status === 302 && /error=invalid_request/.test(r.headers.get('location') || '') && /state=st-123/.test(r.headers.get('location') || ''));

  const consent = (decision, password, t = txn) => noFollow('/oauth/authorize', form({ txn: t, decision, ...(password !== undefined ? { password } : {}) }));
  r = await consent('allow', 'definitely-wrong');
  check('OAuth: wrong admin password -> consent screen again, no code', r.status === 401 && (await r.text()).includes('Wrong password') && !r.headers.get('location'));
  r = await consent('deny');
  check('OAuth: deny -> redirect with access_denied and state', r.status === 303 && /error=access_denied/.test(r.headers.get('location')) && /state=st-123/.test(r.headers.get('location')));
  r = await consent('allow', ADMIN_PASSWORD, 'forged.txn');
  check('OAuth: forged approval token rejected', r.status === 400 && !r.headers.get('location'));

  const getCode = async (challenge) => {
    const page = await (await noFollow(authorizeUrl({}, challenge))).text();
    const t = (page.match(/name="txn" value="([^"]+)"/) || [])[1];
    const out = await consent('allow', ADMIN_PASSWORD, t);
    const loc = new URL(out.headers.get('location') || 'http://x/');
    return { status: out.status, location: loc, code: loc.searchParams.get('code') };
  };
  const approved = await getCode(pk.challenge);
  check('OAuth: correct password -> redirect to the client with code, state and iss', approved.status === 303 && approved.location.origin + approved.location.pathname === REDIRECT && !!approved.code && approved.location.searchParams.get('state') === 'st-123' && approved.location.searchParams.get('iss') === BASE, approved.location.toString());

  const exchange = (code, verifier, extra = {}) => noFollow('/oauth/token', form({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: client.client_id, code_verifier: verifier, ...extra }));
  r = await exchange(approved.code, 'wrong-verifier-wrong-verifier-wrong-verifier-123');
  check('OAuth: wrong PKCE verifier -> invalid_grant', r.status === 400 && (await r.json()).error === 'invalid_grant');
  r = await exchange(approved.code, pk.verifier);
  const tokens = await r.json();
  check('OAuth: code + verifier -> access and refresh tokens', r.status === 200 && tokens.token_type === 'Bearer' && tokens.expires_in === 3600 && !!tokens.access_token && !!tokens.refresh_token && r.headers.get('cache-control') === 'no-store', JSON.stringify(tokens).slice(0, 120));
  r = await exchange(approved.code, pk.verifier);
  check('OAuth: authorization code cannot be used twice', r.status === 400 && (await r.json()).error === 'invalid_grant');
  const pk2 = newPkce();
  const second = await getCode(pk2.challenge);
  r = await exchange(second.code, pk2.verifier, { redirect_uri: 'http://localhost:7777/elsewhere' });
  check('OAuth: redirect_uri mismatch at the token endpoint -> invalid_grant', r.status === 400);

  let m = await mcpCall(tokens.access_token, 'tools/list');
  check('OAuth: access token unlocks /mcp with all 9 tools', m.status === 200 && m.body.result.tools.length === 9, JSON.stringify(m.body).slice(0, 100));
  m = await mcpCall(tokens.access_token, 'tools/call', { name: 'get_config', arguments: {} });
  check('OAuth: admin tool works with an access token', m.status === 200 && m.body.result.isError === false);
  m = await mcpCall('not-a-valid-token', 'tools/list');
  check('OAuth: garbage Bearer -> 401 invalid_token', m.status === 401 && m.body.error === 'invalid_token');

  r = await noFollow('/oauth/token', form({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id }));
  const refreshed = await r.json();
  check('OAuth: refresh token -> new access token that works', r.status === 200 && !!refreshed.access_token && (await mcpCall(refreshed.access_token, 'tools/list')).status === 200);
  r = await noFollow('/oauth/token', form({ grant_type: 'refresh_token', refresh_token: tokens.access_token }));
  check('OAuth: an access token is not accepted as a refresh token', r.status === 400);
  const asCookie = await fetch(`${BASE}/api/admin/status`, { headers: { Cookie: `tete_admin=${tokens.access_token}` } });
  check('OAuth: an access token is NOT accepted as an admin session cookie', (await asCookie.json()).isAdmin === false);
  const clientAsCookie = await fetch(`${BASE}/api/admin/status`, { headers: { Cookie: `tete_admin=${client.client_id}` } });
  check('OAuth: a client_id is NOT accepted as an admin session cookie', (await clientAsCookie.json()).isAdmin === false);
  const publicWithToken = await fetch(`${BASE}/mcp/public`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer junk' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
  check('OAuth: /mcp/public ignores credentials and stays public (5 tools)', (await publicWithToken.json()).result.tools.length === 5);

  if (/^(localhost|127\.0\.0\.1)$/.test(new URL(BASE).hostname) || process.env.OAUTH_REVOKE_TEST === '1') {
    const adm = makeClient();
    await postJson(adm, '/api/admin/login', { password: ADMIN_PASSWORD });
    res = await postJson(adm, '/api/admin/revoke-oauth', {});
    check('OAuth: admin can sign out every connected application', res.status === 200);
    m = await mcpCall(refreshed.access_token, 'tools/list');
    check('OAuth: after sign-out the old access token is rejected', m.status === 401);
    r = await noFollow('/oauth/token', form({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }));
    check('OAuth: after sign-out the old refresh token is rejected', r.status === 400);
    res = await alice('/api/admin/revoke-oauth', { method: 'POST' });
    check('OAuth: revoke needs an admin session', res.status === 403);
  } else {
    console.log('SKIP  OAuth sign-out checks (they would disconnect real clients; set OAUTH_REVOKE_TEST=1 to run them)');
  }
}

// --- two hostnames, one Worker (only checkable with a custom Host header, i.e. against local dev)
if (/^(localhost|127\.0\.0\.1)$/.test(new URL(BASE).hostname)) {
  const { request } = await import('node:http');
  const viaHost = (host, path, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const u = new URL(BASE);
    const req = request({ hostname: u.hostname, port: u.port, path, method, headers: { Host: host, ...headers } }, (r) => {
      let data = '';
      r.on('data', (c) => (data += c));
      r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
  const FRONT = 'tete.apipedia.id';
  const APIH = 'tetein.apipedia.id';
  const created = await viaHost(APIH, '/api/text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'hosts' }) });
  const c = JSON.parse(created.body);
  check('API host: share url points at the frontend host', c.url === `https://${FRONT}/file/${c.id}`, c.url);
  check('API host: download/delete urls stay on the API host', c.downloadUrl === `https://${APIH}/file/${c.id}/download` && c.deleteUrl.startsWith(`https://${APIH}/file/${c.id}?token=`), `${c.downloadUrl} ${c.deleteUrl}`);
  const viaFront = JSON.parse((await viaHost(FRONT, '/api/text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'hosts' }) })).body);
  check('frontend host returns the same link layout', viaFront.url === `https://${FRONT}/file/${viaFront.id}` && viaFront.downloadUrl.startsWith(`https://${APIH}/`));
  let r = await viaHost(APIH, '/');
  check('API host root describes the API (no UI)', r.status === 200 && JSON.parse(r.body).endpoints?.mcp);
  r = await viaHost(FRONT, '/');
  check('frontend host root serves the UI', r.status === 200 && r.body.includes('<html'));
  r = await viaHost(APIH, `/file/${c.id}`, { headers: { Accept: 'text/html', 'Sec-Fetch-Dest': 'document' } });
  check('API host redirects browsers to the frontend share page', r.status === 302 && r.headers.location === `https://${FRONT}/file/${c.id}`, `${r.status} ${r.headers.location}`);
  r = await viaHost(FRONT, `/file/${c.id}`, { headers: { Accept: 'text/html', 'Sec-Fetch-Dest': 'document' } });
  check('frontend host serves the share page', r.status === 200 && r.body.includes('id="fileInfo"'));
  r = await viaHost(APIH, `/file/${c.id}`, { headers: { Accept: 'application/json' } });
  check('API host still returns JSON for API clients', r.status === 200 && JSON.parse(r.body).id === c.id);
  await viaHost(APIH, `/file/${c.id}?token=${c.deleteUrl.split('token=')[1]}`, { method: 'DELETE' });
  await viaHost(APIH, `/file/${viaFront.id}?token=${viaFront.deleteUrl.split('token=')[1]}`, { method: 'DELETE' });
}

// --- docs
res = await alice('/README.md');
check('/README.md served', res.status === 200 && (await res.text()).includes('TETE'));
res = await alice('/api.md');
check('/api.md has BASE_URL substituted', !(await res.text()).includes('{{BASE_URL}}'));
res = await fetch(`${FRONT}/`);
check('frontend / serves web UI', res.status === 200 && (await res.text()).includes('<html'));
res = await alice('/api', { method: 'OPTIONS' });
check('CORS preflight -> 204', res.status === 204 && res.headers.get('Access-Control-Allow-Origin') === '*');

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
