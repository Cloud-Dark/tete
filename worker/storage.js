// File content storage on Supabase Storage (private bucket "tete"), accessed only from the Worker
// with the service-role key. Browsers never see the Supabase URL or key: every request goes through
// tete.apipedia.id and the Worker talks to Supabase server-side.

import { HttpError } from './http.js';

const BUCKET = 'tete';

function settings(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    throw new HttpError(503, 'Storage is not configured (set SUPABASE_URL and the SUPABASE_SERVICE_KEY secret)');
  }
  const base = `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object`;
  return { base, auth: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } };
}

async function ensureOk(res, what) {
  if (res.ok) return res;
  const detail = (await res.text()).slice(0, 300);
  throw new Error(`Supabase Storage ${what} failed: ${res.status} ${detail}`);
}

// `length` (bytes) is required when `body` is a stream so it is forwarded as-is instead of being buffered.
export async function putObject(env, id, body, contentType, length) {
  const { base, auth } = settings(env);
  const headers = { ...auth, 'Content-Type': contentType, 'x-upsert': 'false' };
  if (length !== undefined) headers['Content-Length'] = String(length);
  const res = await fetch(`${base}/${BUCKET}/${id}`, { method: 'POST', headers, body });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    if (res.status === 413 || /maximum allowed size|too large/i.test(detail)) {
      throw new HttpError(413, 'The storage provider refused this file because it is larger than its plan allows');
    }
    throw new Error(`Supabase Storage upload failed: ${res.status} ${detail}`);
  }
}

// Real usage of the bucket, read from Supabase (not from our own table): pages through the object list.
export async function bucketUsage(env, { maxPages = 50 } = {}) {
  const { auth } = settings(env);
  const listUrl = `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/list/${BUCKET}`;
  const pageSize = 1000;
  let objects = 0;
  let bytes = 0;
  let truncated = false;
  for (let page = 0; page < maxPages; page++) {
    const res = await ensureOk(
      await fetch(listUrl, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: '', limit: pageSize, offset: page * pageSize, sortBy: { column: 'name', order: 'asc' } }),
      }),
      'list',
    );
    const rows = await res.json();
    for (const row of rows) {
      if (row.id === null) continue; // folder placeholder
      objects++;
      bytes += Number(row.metadata?.size ?? 0);
    }
    if (rows.length < pageSize) return { objects, bytes, truncated };
    if (page === maxPages - 1) truncated = true;
  }
  return { objects, bytes, truncated };
}

// Returns the upstream Response (stream it to the client) or null when the object does not exist.
export async function getObject(env, id) {
  const { base, auth } = settings(env);
  const res = await fetch(`${base}/${BUCKET}/${id}`, { headers: auth });
  if (res.status === 404 || res.status === 400) {
    await res.body?.cancel(); // Supabase answers 400/404 "Object not found" for a missing object
    return null;
  }
  return ensureOk(res, 'download');
}

export async function deleteObjects(env, ids) {
  if (ids.length === 0) return;
  const { base, auth } = settings(env);
  await ensureOk(
    await fetch(`${base}/${BUCKET}`, {
      method: 'DELETE',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: ids }),
    }),
    'delete',
  );
}
