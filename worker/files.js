// File endpoints: upload (multipart / text), info, verify, download, delete, list.

import { TOTAL_REQUEST_CAP, getConfig, pbkdf2Iterations } from './config.js';
import {
  decryptContent, decryptMeta, encryptWithPassword, randomHex, safeEqual, sha256Hex, unwrapDataKey,
} from './crypto.js';
import { HttpError, attachmentDisposition, json, readJson } from './http.js';
import { deleteObjects, getObject, putObject } from './storage.js';

// Columns needed to describe a file publicly; excludes the enc blob and delete token.
const PUBLIC_COLS = 'id, original_name, mime_type, size, uploaded_at, expires_at, locked';

const ID_PATTERN = /^[a-f0-9]{6}$/;

const isExpired = (row) => row.expires_at !== null && row.expires_at <= Date.now();

function assertId(id) {
  if (!ID_PATTERN.test(id)) throw new HttpError(404, 'File not found');
}

async function getRow(env, id, cols = PUBLIC_COLS) {
  assertId(id);
  const row = await env.DB.prepare(`SELECT ${cols} FROM files WHERE id = ?`).bind(id).first();
  if (!row || isExpired(row)) throw new HttpError(404, 'File not found');
  return row;
}

// expiration: undefined/''/null -> default, 0 -> never, N -> N milliseconds.
function resolveExpiresAt(raw, cfg) {
  let ms = cfg.defaultExpiration;
  if (raw !== undefined && raw !== null && raw !== '') {
    ms = parseInt(raw, 10);
    if (!Number.isFinite(ms) || ms < 0) throw new HttpError(400, 'expiration must be a non-negative number of milliseconds');
  }
  return ms > 0 ? Date.now() + ms : null;
}

function checkExtension(name, cfg) {
  if (cfg.fileWhitelist.length === 0) return;
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  if (!cfg.fileWhitelist.includes(ext)) {
    throw new HttpError(400, `File extension .${ext} is not allowed. Allowed: ${cfg.fileWhitelist.join(', ')}`);
  }
}

function publicView(row, base, { reveal } = {}) {
  const locked = !!row.locked;
  return {
    id: row.id,
    originalName: reveal?.name ?? (locked ? `${row.id}.enc` : row.original_name),
    mimeType: reveal?.mime ?? row.mime_type,
    size: row.size,
    uploadedAt: row.uploaded_at,
    expiresAt: row.expires_at,
    locked,
    encrypted: locked,
    url: `${base}/file/${row.id}`,
    downloadUrl: `${base}/file/${row.id}/download`,
  };
}

// Persists one file: D1 row first (claims the id), then the Storage object; rolls back the row if the upload fails.
async function storeFile(env, cfg, { name, mime, data, size, password, expiresAt, userId, base }) {
  let storedBody = data;
  let enc = null;
  let publicName = name;
  let publicMime = mime;

  if (password) {
    const plain = new Uint8Array(await data.arrayBuffer());
    const result = await encryptWithPassword(plain, { name, mime }, password, pbkdf2Iterations(env));
    storedBody = result.ciphertext;
    enc = JSON.stringify(result.descriptor);
    publicName = null;
    publicMime = 'application/octet-stream';
  }

  const deleteToken = randomHex(16);
  const deleteHash = await sha256Hex(deleteToken);
  const uploadedAt = new Date().toISOString();

  let id = null;
  for (let attempt = 0; attempt < 8 && !id; attempt++) {
    const candidate = randomHex(3);
    try {
      await env.DB.prepare(
        `INSERT INTO files (id, original_name, mime_type, size, uploaded_at, expires_at, user_id, delete_token, locked, enc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(candidate, publicName, publicMime, size, uploadedAt, expiresAt, userId, deleteHash, password ? 1 : 0, enc).run();
      id = candidate;
    } catch (err) {
      if (!/UNIQUE|constraint/i.test(String(err.message))) throw err;
    }
  }
  if (!id) throw new HttpError(503, 'Could not allocate a file id, please retry');

  try {
    await putObject(env, id, storedBody, password ? 'application/octet-stream' : publicMime);
  } catch (err) {
    await env.DB.prepare('DELETE FROM files WHERE id = ?').bind(id).run();
    throw err;
  }

  const row = {
    id, original_name: publicName, mime_type: publicMime, size, uploaded_at: uploadedAt, expires_at: expiresAt, locked: password ? 1 : 0,
  };
  return {
    ...publicView(row, base, { reveal: { name, mime } }),
    deleteUrl: `${base}/file/${id}?token=${deleteToken}`,
    deleteToken,
  };
}

function checkContentLength(request, cfg) {
  const length = parseInt(request.headers.get('Content-Length') || '0', 10);
  const cap = Math.min(cfg.maxFileSize * cfg.maxFilesPerUpload + 1024 * 1024, TOTAL_REQUEST_CAP);
  if (length > cap) throw new HttpError(413, `Request too large. Maximum total upload is ${Math.floor(cap / 1024 / 1024)} MB`);
}

// POST /api and POST /api/upload - multipart/form-data, fields "file" or "files", optional password + expiration.
export async function uploadFiles(request, env, ctx) {
  const cfg = await getConfig(env);
  checkContentLength(request, cfg);

  let form;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, 'Expected multipart/form-data body');
  }

  const files = [...form.getAll('file'), ...form.getAll('files')].filter((f) => typeof f !== 'string');
  if (files.length === 0) throw new HttpError(400, 'No file provided');
  if (files.length > cfg.maxFilesPerUpload) throw new HttpError(400, `Too many files. Maximum is ${cfg.maxFilesPerUpload}`);

  for (const f of files) {
    if (f.size > cfg.maxFileSize) {
      throw new HttpError(413, `File "${f.name}" exceeds the ${Math.round(cfg.maxFileSize / 1024 / 1024)} MB limit`);
    }
    checkExtension(f.name, cfg);
  }

  const password = form.get('password') || null;
  const expiresAt = resolveExpiresAt(form.get('expiration'), cfg);
  const base = new URL(request.url).origin;

  const results = [];
  for (const f of files) {
    results.push(await storeFile(env, cfg, {
      name: f.name || 'file',
      mime: f.type || 'application/octet-stream',
      data: f,
      size: f.size,
      password: typeof password === 'string' ? password : null,
      expiresAt,
      userId: ctx.userId,
      base,
    }));
  }
  return json(results.length === 1 ? results[0] : results);
}

// POST /api/text - JSON { text, filename?, password?, expiration? }
export async function uploadText(request, env, ctx) {
  const cfg = await getConfig(env);
  const { text, filename, password, expiration } = await readJson(request);
  if (typeof text !== 'string' || !text) throw new HttpError(400, 'Text content is required');

  const data = new Blob([text], { type: 'text/plain' });
  if (data.size > cfg.maxFileSize) {
    throw new HttpError(413, `Text exceeds the ${Math.round(cfg.maxFileSize / 1024 / 1024)} MB limit`);
  }
  const name = typeof filename === 'string' && filename.trim() ? filename.trim() : null;
  if (name) checkExtension(name, cfg);

  const base = new URL(request.url).origin;
  const result = await storeFile(env, cfg, {
    name: name || `${randomHex(3)}.txt`,
    mime: 'text/plain',
    data,
    size: data.size,
    password: typeof password === 'string' && password ? password : null,
    expiresAt: resolveExpiresAt(expiration, cfg),
    userId: ctx.userId,
    base,
  });
  return json(result);
}

// GET /api/file/:id (also GET /file/:id for non-browser clients)
export async function fileInfo(request, env, id) {
  const row = await getRow(env, id);
  return json(publicView(row, new URL(request.url).origin));
}

// POST /file/:id/verify - JSON { password }
export async function verifyFile(request, env, id) {
  const row = await getRow(env, id, 'id, expires_at, locked, enc');
  if (!row.locked) return json({ success: true, message: 'File is not locked' });

  const { password } = await readJson(request);
  if (!password) throw new HttpError(401, 'Password required');
  try {
    await unwrapDataKey(JSON.parse(row.enc), String(password));
  } catch {
    throw new HttpError(401, 'Invalid password');
  }
  return json({ success: true, message: 'Password correct' });
}

// GET /file/:id/download[?password=...] (password may also be sent as X-Password)
export async function downloadFile(request, env, id) {
  const row = await getRow(env, id, `${PUBLIC_COLS}, enc`);
  const object = await getObject(env, id);
  if (!object) throw new HttpError(404, 'File not found');

  const common = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

  if (!row.locked) {
    return new Response(object.body, {
      headers: {
        ...common,
        'Content-Type': row.mime_type,
        'Content-Length': String(row.size),
        'Content-Disposition': attachmentDisposition(row.original_name),
      },
    });
  }

  const password = new URL(request.url).searchParams.get('password') || request.headers.get('X-Password');
  if (!password) {
    await object.body?.cancel();
    throw new HttpError(401, 'Password required');
  }

  const descriptor = JSON.parse(row.enc);
  let plain;
  let meta;
  try {
    const key = await unwrapDataKey(descriptor, password);
    plain = await decryptContent(descriptor, key, new Uint8Array(await object.arrayBuffer()));
    meta = await decryptMeta(descriptor, key);
  } catch {
    throw new HttpError(401, 'Invalid password');
  }
  return new Response(plain, {
    headers: {
      ...common,
      'Content-Type': meta.mime || 'application/octet-stream',
      'Content-Length': String(plain.byteLength),
      'Content-Disposition': attachmentDisposition(meta.name),
    },
  });
}

// DELETE /file/:id - allowed for the owner (cookie), an admin session, or the holder of the delete token.
export async function deleteFile(request, env, id, ctx) {
  const row = await getRow(env, id, 'id, expires_at, user_id, delete_token');
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || request.headers.get('X-Delete-Token');

  const allowed =
    ctx.isAdmin ||
    row.user_id === ctx.userId ||
    (token && safeEqual(await sha256Hex(token), row.delete_token));
  if (!allowed) throw new HttpError(403, 'Not allowed to delete this file');

  await deleteObjects(env, [id]);
  await env.DB.prepare('DELETE FROM files WHERE id = ?').bind(id).run();
  return json({ success: true, message: 'File deleted successfully' });
}

// GET /api/files - the caller's own files; an admin sees everything.
export async function listFiles(request, env, ctx) {
  const base = new URL(request.url).origin;
  const now = Date.now();
  const query = ctx.isAdmin
    ? env.DB.prepare(`SELECT ${PUBLIC_COLS} FROM files WHERE (expires_at IS NULL OR expires_at > ?) ORDER BY uploaded_at DESC LIMIT 200`).bind(now)
    : env.DB.prepare(`SELECT ${PUBLIC_COLS} FROM files WHERE user_id = ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY uploaded_at DESC LIMIT 200`).bind(ctx.userId, now);
  const { results } = await query.all();
  return json(results.map((row) => publicView(row, base)));
}

// Cron: delete expired objects and rows in batches.
export async function purgeExpired(env) {
  let purged = 0;
  for (let round = 0; round < 20; round++) {
    const { results } = await env.DB.prepare(
      'SELECT id FROM files WHERE expires_at IS NOT NULL AND expires_at <= ? LIMIT 100',
    ).bind(Date.now()).all();
    if (results.length === 0) break;
    const ids = results.map((r) => r.id);
    await deleteObjects(env, ids);
    const placeholders = ids.map(() => '?').join(',');
    await env.DB.prepare(`DELETE FROM files WHERE id IN (${placeholders})`).bind(...ids).run();
    purged += ids.length;
  }
  return purged;
}
