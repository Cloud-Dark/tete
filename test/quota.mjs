// Quota test. Run against a dev server started with a tiny STORAGE_QUOTA_BYTES (see .dev.vars):
//   STORAGE_QUOTA_BYTES=2000000 npx wrangler dev   then   BASE_URL=http://localhost:8787 node test/quota.mjs
const BASE = (process.env.BASE_URL || 'http://localhost:8787').replace(/\/$/, '');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`); if (!ok) failed++; };

const usage = async () => (await fetch(`${BASE}/api/usage`)).json();
const upload = async (bytes, name) => {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)]), name);
  return fetch(`${BASE}/api`, { method: 'POST', body: form });
};

const start = await usage();
check('quota is the small test value', start.storage.quotaBytes <= 2_100_000, JSON.stringify(start.storage));
const room = start.storage.remainingBytes;

const first = await upload(1_200_000, 'q1.bin');
const firstJson = first.status === 200 ? await first.json() : null;
check('first 1.2 MB upload fits', first.status === 200, String(first.status));

const second = await upload(1_200_000, 'q2.bin');
const secondBody = await second.json().catch(() => ({}));
check('second 1.2 MB upload exceeds the quota -> 507 "Storage is full"', second.status === 507 && /Storage is full/.test(secondBody.error || ''), `${second.status} ${JSON.stringify(secondBody)}`);

const mid = await usage();
check('usage reflects the first upload and shrinking remainder', mid.storage.usedBytes >= start.storage.usedBytes + 1_200_000 && mid.storage.remainingBytes < room, JSON.stringify(mid.storage));

if (firstJson) {
  await fetch(`${BASE}/file/${firstJson.id}?token=${firstJson.deleteToken}`, { method: 'DELETE' });
  const third = await upload(1_200_000, 'q3.bin');
  check('after deleting, the same upload fits again', third.status === 200, String(third.status));
  if (third.status === 200) { const t = await third.json(); await fetch(`${BASE}/file/${t.id}?token=${t.deleteToken}`, { method: 'DELETE' }); }
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll quota checks passed');
process.exit(failed ? 1 : 0);
