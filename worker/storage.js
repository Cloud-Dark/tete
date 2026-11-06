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

export async function putObject(env, id, body, contentType) {
  const { base, auth } = settings(env);
  await ensureOk(
    await fetch(`${base}/${BUCKET}/${id}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': contentType, 'x-upsert': 'false' },
      body,
    }),
    'upload',
  );
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
