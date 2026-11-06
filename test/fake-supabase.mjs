// Local stand-in for the parts of the Supabase Storage REST API that the Worker uses.
// It models the documented behaviour (auth header, POST/GET/DELETE object, bulk delete via prefixes)
// so the Worker can be exercised end to end without a Supabase project. It is NOT a substitute for
// running test/smoke.mjs against the real deployment.
import { createServer } from 'node:http';

const PORT = process.env.PORT || 8790;
const KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';
const objects = new Map();

const readBody = (req) => new Promise((resolve) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => resolve(Buffer.concat(chunks)));
});

createServer(async (req, res) => {
  const send = (status, body, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/__count') return send(200, { count: objects.size });
  if (req.headers.authorization !== `Bearer ${KEY}` || req.headers.apikey !== KEY) {
    return send(401, { statusCode: '401', error: 'Unauthorized', message: 'invalid JWT' });
  }

  // POST /storage/v1/object/list/tete  { prefix, limit, offset, sortBy }  ->  [{ name, id, metadata: { size } }]
  if (req.method === 'POST' && url.pathname === '/storage/v1/object/list/tete') {
    const { limit = 100, offset = 0 } = JSON.parse((await readBody(req)).toString() || '{}');
    const rows = [...objects.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(offset, offset + limit)
      .map(([name, o]) => ({ name, id: `id-${name}`, metadata: { size: o.body.length, mimetype: o.type } }));
    return send(200, rows);
  }

  const m = url.pathname.match(/^\/storage\/v1\/object\/tete(?:\/([a-f0-9]+))?$/);
  if (!m) return send(404, { error: 'not_found' });
  const id = m[1];

  if (req.method === 'POST' && id) {
    if (objects.has(id) && req.headers['x-upsert'] !== 'true') return send(409, { statusCode: '409', error: 'Duplicate' });
    objects.set(id, { body: await readBody(req), type: req.headers['content-type'] });
    return send(200, { Key: `tete/${id}`, Id: id });
  }
  if (req.method === 'GET' && id) {
    const obj = objects.get(id);
    if (!obj) return send(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    return send(200, obj.body, { 'Content-Type': obj.type || 'application/octet-stream' });
  }
  if (req.method === 'DELETE' && !id) {
    const { prefixes = [] } = JSON.parse((await readBody(req)).toString() || '{}');
    prefixes.forEach((p) => objects.delete(p));
    return send(200, prefixes.map((name) => ({ name })));
  }
  return send(405, { error: 'method not allowed' });
}).listen(PORT, () => console.log(`fake supabase storage on :${PORT}`));
