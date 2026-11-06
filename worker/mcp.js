// Minimal MCP server (Streamable HTTP transport, stateless JSON responses) at POST /mcp.
// Tools reuse the exact same handlers as the REST API, so limits, encryption and expiry behave identically.

import { deleteFile, downloadFile, fileInfo, uploadFiles, uploadText } from './files.js';
import { HttpError, json } from './http.js';

const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_READ_BYTES = 1024 * 1024;

const expiration = { type: 'integer', minimum: 0, description: 'Lifetime in milliseconds. 0 = never, omitted = server default.' };
const password = { type: 'string', description: 'Optional. Encrypts the file (AES-256-GCM); required again to read it.' };

const TOOLS = [
  {
    name: 'upload_text',
    description: 'Store a text snippet and get a short share link. Returns id, url, downloadUrl and a one-time deleteToken.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' }, filename: { type: 'string' }, password, expiration_ms: expiration },
      required: ['text'],
    },
  },
  {
    name: 'upload_base64',
    description: 'Store a file given as base64 and get a short share link. Returns id, url, downloadUrl and a one-time deleteToken.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string' },
        content_base64: { type: 'string' },
        mime_type: { type: 'string' },
        password,
        expiration_ms: expiration,
      },
      required: ['filename', 'content_base64'],
    },
  },
  {
    name: 'file_info',
    description: 'Metadata for a file id: name, size, mime type, expiry, whether it is password-locked.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'read_text',
    description: 'Read a text file (up to 1 MB). Provide the password for locked files.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, password: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'delete_file',
    description: 'Delete a file with the deleteToken returned at upload time.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, token: { type: 'string' } }, required: ['id', 'token'] },
  },
];

const internalUrl = (origin, path) => new URL(path, origin).toString();

function base64ToBytes(b64) {
  try {
    const bin = atob(String(b64).replace(/\s+/g, ''));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    throw new HttpError(400, 'content_base64 is not valid base64');
  }
}

async function unwrap(response) {
  if (response.ok) return response;
  let message = `Request failed (${response.status})`;
  try {
    message = (await response.json()).error || message;
  } catch { /* keep default */ }
  throw new HttpError(response.status, message);
}

async function callTool(name, args, env, ctx, origin) {
  const post = (path, body) => new Request(internalUrl(origin, path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  switch (name) {
    case 'upload_text': {
      const res = await unwrap(await uploadText(post('/api/text', {
        text: args.text, filename: args.filename, password: args.password, expiration: args.expiration_ms,
      }), env, ctx));
      return res.json();
    }
    case 'upload_base64': {
      const bytes = base64ToBytes(args.content_base64);
      const form = new FormData();
      form.append('file', new File([bytes], String(args.filename), { type: args.mime_type || 'application/octet-stream' }));
      if (args.password) form.append('password', String(args.password));
      if (args.expiration_ms !== undefined) form.append('expiration', String(args.expiration_ms));
      const res = await unwrap(await uploadFiles(new Request(internalUrl(origin, '/api'), { method: 'POST', body: form }), env, ctx));
      return res.json();
    }
    case 'file_info':
      return (await unwrap(await fileInfo(new Request(internalUrl(origin, '/api/file/x')), env, String(args.id)))).json();
    case 'read_text': {
      const url = new URL(internalUrl(origin, `/file/${args.id}/download`));
      const res = await unwrap(await downloadFile(new Request(url, { headers: args.password ? { 'X-Password': String(args.password) } : {} }), env, String(args.id)));
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length > MAX_READ_BYTES) throw new HttpError(413, 'File is larger than 1 MB; download it from downloadUrl instead');
      if (!/^text\/|json|xml|javascript/.test(res.headers.get('Content-Type') || '')) {
        throw new HttpError(415, 'Not a text file; download it from downloadUrl instead');
      }
      return { text: new TextDecoder().decode(bytes) };
    }
    case 'delete_file':
      return (await unwrap(await deleteFile(
        new Request(internalUrl(origin, `/file/${args.id}`), { method: 'DELETE', headers: { 'X-Delete-Token': String(args.token) } }),
        env, String(args.id), ctx,
      ))).json();
    default:
      throw new HttpError(404, `Unknown tool: ${name}`);
  }
}

async function handleMessage(msg, env, ctx, origin) {
  const { id, method, params } = msg || {};
  const isNotification = id === undefined;
  const ok = (result) => (isNotification ? null : { jsonrpc: '2.0', id, result });
  const fail = (code, message) => (isNotification ? null : { jsonrpc: '2.0', id: id ?? null, error: { code, message } });

  if (!msg || msg.jsonrpc !== '2.0' || typeof method !== 'string') return fail(-32600, 'Invalid Request');

  switch (method) {
    case 'initialize': {
      const wanted = params?.protocolVersion;
      return ok({
        protocolVersion: SUPPORTED_VERSIONS.includes(wanted) ? wanted : SUPPORTED_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'tete', title: 'TETE file sharing', version: '2.0.0' },
        instructions: 'Temporary file sharing. Files expire automatically. Keep the deleteToken returned by uploads.',
      });
    }
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: TOOLS });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) return fail(-32602, `Unknown tool: ${params?.name}`);
      try {
        const data = await callTool(tool.name, params.arguments || {}, env, ctx, origin);
        return ok({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], isError: false });
      } catch (err) {
        if (!(err instanceof HttpError)) console.error('MCP tool error:', err?.stack || err);
        const text = err instanceof HttpError ? err.message : 'Internal server error';
        return ok({ content: [{ type: 'text', text }], isError: true });
      }
    }
    default:
      return method.startsWith('notifications/') ? null : fail(-32601, `Method not found: ${method}`);
  }
}

export async function handleMcp(request, env, ctx) {
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
  }

  const origin = new URL(request.url).origin;
  const messages = Array.isArray(body) ? body : [body];
  const replies = (await Promise.all(messages.map((m) => handleMessage(m, env, ctx, origin)))).filter(Boolean);

  if (replies.length === 0) return new Response(null, { status: 202 });
  return json(Array.isArray(body) ? replies : replies[0]);
}
