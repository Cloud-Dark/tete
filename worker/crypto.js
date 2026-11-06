// WebCrypto helpers: AES-256-GCM content encryption, PBKDF2 key wrapping, hashing, HMAC.

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const toB64Url = (bytes) => toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64Url = (s) => fromB64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));

export function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function randomHex(nBytes) {
  return [...randomBytes(nBytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time string comparison (hex digests / signatures only).
export function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function aesEncrypt(key, data) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { iv, ct: new Uint8Array(ct) }; // ct = ciphertext || 16-byte auth tag
}

async function aesDecrypt(key, iv, ct) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));
}

// Encrypts content + metadata ({name, mime}) under a fresh data key, and wraps that key with the password.
// Returns the ciphertext (stored in R2) and the descriptor (stored in D1, safe to persist).
export async function encryptWithPassword(plain, meta, password, iterations) {
  const dataKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const content = await aesEncrypt(dataKey, plain);
  const metaEnc = await aesEncrypt(dataKey, enc.encode(JSON.stringify(meta)));

  const salt = randomBytes(16);
  const kek = await deriveKey(password, salt, iterations);
  const wrapped = await aesEncrypt(kek, await crypto.subtle.exportKey('raw', dataKey));

  return {
    ciphertext: content.ct,
    descriptor: {
      v: 1,
      iterations,
      salt: toB64(salt),
      wrappedKey: toB64(wrapped.ct),
      keyIv: toB64(wrapped.iv),
      iv: toB64(content.iv),
      meta: toB64(metaEnc.ct),
      metaIv: toB64(metaEnc.iv),
    },
  };
}

// Returns the data key, or throws if the password is wrong.
export async function unwrapDataKey(descriptor, password) {
  const kek = await deriveKey(password, fromB64(descriptor.salt), descriptor.iterations);
  const raw = await aesDecrypt(kek, fromB64(descriptor.keyIv), fromB64(descriptor.wrappedKey));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
}

export async function decryptContent(descriptor, dataKey, ciphertext) {
  return aesDecrypt(dataKey, fromB64(descriptor.iv), ciphertext);
}

export async function decryptMeta(descriptor, dataKey) {
  const bytes = await aesDecrypt(dataKey, fromB64(descriptor.metaIv), fromB64(descriptor.meta));
  return JSON.parse(dec.decode(bytes));
}

// Admin password hashing: "pbkdf2$<iterations>$<salt b64>$<hash b64>"
async function pbkdf2Bits(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, 256));
}

export async function hashPassword(password, iterations) {
  const salt = randomBytes(16);
  const bits = await pbkdf2Bits(password, salt, iterations);
  return `pbkdf2$${iterations}$${toB64(salt)}$${toB64(bits)}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, iter, salt, hash] = String(stored).split('$');
  if (scheme !== 'pbkdf2' || !iter || !salt || !hash) return false;
  const bits = await pbkdf2Bits(password, fromB64(salt), parseInt(iter, 10));
  return safeEqual(toB64(bits), hash);
}

// Signed, expiring tokens for stateless sessions: base64url(payload).base64url(hmac)
async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signToken(payload, secret) {
  const body = toB64Url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return `${body}.${toB64Url(sig)}`;
}

export async function verifyToken(token, secret) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64Url(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(dec.decode(fromB64Url(body)));
    return payload.exp && payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}
