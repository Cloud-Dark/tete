// End-to-end smoke test. Usage: BASE_URL=http://localhost:8787 ADMIN_PASSWORD=... node test/smoke.mjs
// Works against `wrangler dev` or a deployed Worker.

const BASE = (process.env.BASE_URL || 'http://localhost:8787').replace(/\/$/, '');
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

res = await alice(`/file/${text.id}`, { headers: { Accept: 'text/html', 'Sec-Fetch-Dest': 'document' } });
const html = await res.text();
check('GET /file/:id from browser serves file-view page', res.status === 200 && html.includes('File Details'), `${res.status} ${html.slice(0, 80)}`);

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
const big = new FormData();
big.append('file', new Blob([new Uint8Array(26 * 1024 * 1024)]), 'big.bin');
res = await alice('/api', { method: 'POST', body: big });
check('file over limit -> 413', res.status === 413, String(res.status));

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
res = await postJson(alice, '/api/config', { fileWhitelist: 'txt,png' });
check('admin can update whitelist', (await res.json()).fileWhitelist.join() === 'txt,png');
form = new FormData();
form.append('file', new Blob(['x']), 'bad.exe');
res = await alice('/api', { method: 'POST', body: form });
check('whitelist rejects .exe -> 400', res.status === 400);
await postJson(alice, '/api/config', { fileWhitelist: '' });
const all = await (await alice('/api/files')).json();
check('admin list sees all users files', all.some((f) => f.id === locked.id));
res = await postJson(alice, '/api/admin/logout', {});
res = await alice('/api/admin/status');
check('admin logout clears session', (await res.json()).isAdmin === false);

// --- docs
res = await alice('/README.md');
check('/README.md served', res.status === 200 && (await res.text()).includes('TETE'));
res = await alice('/api.md');
check('/api.md has BASE_URL substituted', !(await res.text()).includes('{{BASE_URL}}'));
res = await alice('/');
check('/ serves web UI', res.status === 200 && (await res.text()).includes('<html'));
res = await alice('/api', { method: 'OPTIONS' });
check('CORS preflight -> 204', res.status === 204 && res.headers.get('Access-Control-Allow-Origin') === '*');

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
