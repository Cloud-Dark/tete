// TETE - Cloudflare Worker entry point. Serves the API; static UI comes from the ASSETS binding.

import agentDoc from '../AGENT.md';
import apiDoc from '../api.md';
import readmeDoc from '../README.md';
import * as admin from './admin.js';
import { isAdmin, resolveUser } from './auth.js';
import * as files from './files.js';
import { handleMcp } from './mcp.js';
import { HttpError, errorResponse, json, withCors } from './http.js';

const DOCS = { '/README.md': readmeDoc, '/AGENT.md': agentDoc, '/api.md': apiDoc };

// Rendered docs per origin: the substitution only has to run once per isolate.
const renderedDocs = new Map();

// Only uploads create ownership, so only they need to issue the owner cookie.
const UPLOAD_PATHS = new Set(['/api', '/api/', '/api/upload', '/api/text']);

const wantsHtml = (request) => {
  if (request.headers.get('Sec-Fetch-Dest') === 'document') return true;
  const accept = request.headers.get('Accept') || '';
  return accept.includes('text/html') && !accept.includes('application/json');
};

function apiIndex() {
  return json({
    message: 'TETE - Transient Endpoint for Transfer & Encryption',
    docs: ['/README.md', '/api.md', '/AGENT.md'],
    endpoints: {
      uploadSingle: 'POST /api (multipart/form-data, field: file)',
      upload: 'POST /api/upload (multipart/form-data, field: files)',
      uploadText: 'POST /api/text (JSON: { text, filename, password, expiration })',
      fileInfo: 'GET /api/file/:id',
      download: 'GET /file/:id/download',
      delete: 'DELETE /file/:id',
      listFiles: 'GET /api/files',
      mcp: 'POST /mcp (Model Context Protocol, tools: upload_text, upload_base64, file_info, read_text, delete_file)',
    },
  });
}

// Fallback for accounts without a free cron slot: a successful upload also purges expired files in the
// background, at most once per interval per isolate. Reads already treat expired files as 404, so this only
// reclaims storage.
let lastPurge = 0;
function maybePurge(env, execCtx) {
  const interval = parseInt(env.PURGE_INTERVAL_MS, 10) || 10 * 60 * 1000;
  if (Date.now() - lastPurge < interval) return;
  lastPurge = Date.now();
  execCtx.waitUntil(files.purgeExpired(env).catch((err) => console.error('Background purge failed:', err?.message || err)));
}

async function route(request, env, ctx) {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;
  let m;

  if (method === 'GET' && DOCS[pathname]) {
    const key = url.origin + pathname;
    let body = renderedDocs.get(key);
    if (body === undefined) {
      body = DOCS[pathname].replace(/{{BASE_URL}}/g, url.origin).replace(/http:\/\/localhost:3232/g, url.origin);
      renderedDocs.set(key, body);
    }
    return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
  }

  if (pathname === '/api' || pathname === '/api/') {
    return method === 'POST' ? files.uploadFiles(request, env, ctx) : apiIndex();
  }
  if (pathname === '/mcp') return handleMcp(request, env, ctx);
  if (pathname === '/api/upload' && method === 'POST') return files.uploadFiles(request, env, ctx);
  if (pathname === '/api/text' && method === 'POST') return files.uploadText(request, env, ctx);
  if (pathname === '/api/files' && method === 'GET') return files.listFiles(request, env, ctx);

  if ((m = pathname.match(/^\/api\/file\/([^/]+)$/)) && method === 'GET') return files.fileInfo(request, env, m[1]);

  if ((m = pathname.match(/^\/file\/([^/]+)$/))) {
    if (method === 'GET') {
      if (wantsHtml(request)) return env.ASSETS.fetch(new Request(new URL('/file-view', url), request));
      return files.fileInfo(request, env, m[1]);
    }
    if (method === 'DELETE') return files.deleteFile(request, env, m[1], ctx);
  }
  if ((m = pathname.match(/^\/file\/([^/]+)\/verify$/)) && method === 'POST') return files.verifyFile(request, env, m[1]);
  if ((m = pathname.match(/^\/file\/([^/]+)\/download$/)) && method === 'GET') return files.downloadFile(request, env, m[1]);

  if (pathname === '/api/admin/login' && method === 'POST') return admin.login(request, env);
  if (pathname === '/api/admin/logout' && method === 'POST') return admin.logout(request);
  if (pathname === '/api/admin/status' && method === 'GET') return admin.status(ctx);
  if (pathname === '/api/admin/verify-password' && method === 'POST') return admin.verifyPassword(request, env, ctx);
  if (pathname === '/api/admin/change-password' && method === 'POST') return admin.changePassword(request, env, ctx);
  if (pathname === '/api/config' && method === 'GET') return admin.getConfigHandler(env, ctx);
  if (pathname === '/api/config' && method === 'POST') return admin.updateConfig(request, env, ctx);

  throw new HttpError(404, 'Not found');
}

export default {
  async fetch(request, env, execCtx) {
    if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));

    const user = resolveUser(request);
    const ctx = { userId: user.userId, isAdmin: await isAdmin(request, env) };

    let response;
    try {
      response = await route(request, env, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        response = errorResponse(err.status, err.message);
      } else {
        console.error('Unhandled error:', err?.stack || err);
        response = errorResponse(500, 'Internal server error');
      }
    }

    if (response.ok && request.method === 'POST' && UPLOAD_PATHS.has(new URL(request.url).pathname)) maybePurge(env, execCtx);

    response = withCors(response);
    if (user.setCookie && request.method === 'POST' && UPLOAD_PATHS.has(new URL(request.url).pathname)) response.headers.append('Set-Cookie', user.setCookie);
    return response;
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(files.purgeExpired(env).then((n) => n && console.log(`Purged ${n} expired file(s)`)));
  },
};
