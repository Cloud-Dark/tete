# Technical Requirements Document (TRD)

> Status: Final
> Last updated: 2026-11-06
> Owner: Cloud-Dark

## Stack

| Layer | Choice |
|-------|--------|
| Runtime | Cloudflare Workers (ES modules, `nodejs_compat`), no framework, no runtime dependencies |
| Public entry point | Only `tete.apipedia.id` (and `tetein.apipedia.id`); Supabase is never exposed to browsers |
| UI hosting | Workers Static Assets (`client/`), binding `ASSETS` |
| File content | Supabase Storage, private bucket `tete`, object name = file id; accessed only by the Worker with the service-role key (`worker/storage.js`) |
| Metadata and config | D1, binding `DB` ([20_DATABASE.md](20_DATABASE.md)) |
| Scheduling | Background purge after uploads (`maybePurge`); optional Cron Trigger `*/30 * * * *` (needs a free cron slot or Paid plan) |
| Crypto | WebCrypto: AES-256-GCM, PBKDF2-SHA256, HMAC-SHA256 |
| MCP | `POST /mcp`, Streamable HTTP, stateless JSON-RPC (`worker/mcp.js`) |
| Tooling | Wrangler 4 (dev, migrations, deploy) |

## Requirements

| ID | Requirement |
|----|-------------|
| TR-001 | The service runs only on Cloudflare Workers; no Node server, disk, or in-memory state. |
| TR-002 | UI and API are served from the same Worker and origin; the client uses relative/same-origin URLs. |
| TR-003 | File ids are 6 hex characters from `crypto.getRandomValues`; collisions are retried up to 8 times. |
| TR-004 | Unlocked files are stored as-is in Supabase Storage and streamed through the Worker on download. |
| TR-005 | Locked files are encrypted with a random 256-bit key (AES-256-GCM); the key is wrapped with a PBKDF2-SHA256 key derived from the password (per-file 16-byte salt, iteration count stored per file). |
| TR-006 | For locked files the real filename and MIME type are encrypted; D1 holds `NULL`/`application/octet-stream`. |
| TR-007 | The file password and its hash are never stored; verification is a successful key unwrap. |
| TR-008 | Expired files are rejected at read time (`404`) and purged in batches of 100 by a background task after uploads (throttled to once per 10 minutes per isolate) and, when enabled, by the cron trigger (Storage objects first, then D1 rows). |
| TR-009 | Delete requires the owner cookie, an admin session, or the delete token (stored as SHA-256). |
| TR-010 | Admin sessions are HMAC-signed, expiring cookies (24 h, `HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS). |
| TR-011 | The admin password comes from the `ADMIN_PASSWORD` secret until changed in the UI, then lives in D1 as a salted PBKDF2 hash. There is no default password. |
| TR-012 | Public uploads and every upload with a password are at most 25 MB (`HARD_MAX_FILE_BYTES`; the admin setting can lower it, never raise it) because they are processed in memory; a request is capped at 60 MB. |
| TR-028 | Public lifetime is at most 7 days (`PUBLIC_MAX_EXPIRATION_MS`); `expiration=0` from a non-admin is `403`, and a default of 0 or more than 7 days is capped for non-admins. |
| TR-029 | `POST /api/admin/upload` (admin only) streams the raw request body to storage with its `Content-Length`, never buffering the file, so TETE sets no size limit; unlocked files only; not counted against the quota. A provider refusal (object too large for the plan) becomes `413`. |
| TR-030 | The admin dashboard reads real bucket usage from the storage provider (`/api/admin/storage`, pages through the object list, cached 20 s) and aggregates from D1 (`/api/admin/stats`, one query). |
| TR-026 | `GET /api/usage` returns storage used, quota, remaining and file count (live, non-expired rows) plus the active limits, aggregates only. Counted with one query, cached 15 s per instance, invalidated by uploads, deletes and purges. |
| TR-027 | An upload that would exceed `STORAGE_QUOTA_BYTES` is rejected with `507` before any data is stored. The quota is soft: concurrent uploads in different instances can overshoot slightly. |
| TR-013 | Downloads send `Content-Disposition: attachment` (header-injection safe, UTF-8 names) and `X-Content-Type-Options: nosniff`. |
| TR-014 | API errors are JSON `{ "error": "..." }` with accurate status codes; unexpected errors are logged and return `500`. |
| TR-016 | D1 usage is minimised: two indexes only, narrow column lists, config cached per isolate (60 s), list capped at 200 rows ([20_DATABASE.md](20_DATABASE.md)). |
| TR-017 | CPU usage is minimised: unlocked files are streamed from Storage without buffering or hashing; PBKDF2 runs only for locked files, the admin password hash and password changes; the owner cookie is issued only on uploads; rendered docs are cached per isolate; the background purge is throttled to once per 10 minutes per isolate (the optional cron runs every 30 minutes). |
| TR-018 | Supabase credentials are server-side only: `SUPABASE_URL` is a variable, `SUPABASE_SERVICE_KEY` a Worker secret; the bucket is private and no storage policies exist. |
| TR-020 | With a valid `MCP_TOKEN` Bearer header, `/mcp` also exposes `list_files`, `get_config`, `update_config`, `purge_expired` and token-less `delete_file`; a wrong token returns `401`, the token is compared via SHA-256 digests in constant time. |
| TR-023 | `/mcp` is an OAuth 2.1 protected resource: RFC 9728 and RFC 8414 metadata, RFC 7591 dynamic registration of public clients, authorization code flow with mandatory PKCE S256, refresh tokens, exact redirect URI matching (https, or http on loopback only). |
| TR-024 | Consent requires the admin password on every approval; the approval request is a signed, 10-minute token so its parameters cannot be altered; the page is not frameable and its CSP limits `form-action` to itself and the registered redirect origin. |
| TR-025 | OAuth tokens are stateless HMAC-signed values derived from `SESSION_SECRET`; every purpose (admin cookie, client id, approval request, code, access, refresh) has its own key, so a token never verifies for another purpose. Codes are single-use via the `oauth_codes` table; bumping `oauthEpoch` revokes all tokens immediately. |
| TR-021 | `POST /api/config` validates every field before writing any, so a rejected request changes nothing. |
| TR-022 | The web UI is static HTML, CSS and vanilla JS without a build step: tokens in CSS variables, light and dark themes set before first paint, WCAG-minded focus rings, `prefers-reduced-motion` respected, no horizontal scroll at 390 px. |
| TR-019 | `/mcp` exposes `upload_text`, `upload_base64`, `file_info`, `read_text`, `delete_file` by calling the same handlers as the REST API, so limits, encryption and expiry are identical. |
| TR-015 | `test/smoke.mjs` exercises the full API and runs against local dev or a deployed URL. |

## Technical constraints

- Workers Free plan: 10 ms CPU per request; PBKDF2 at 100,000 iterations needs the Paid plan ([10_RISK_REGISTER.md](10_RISK_REGISTER.md) R-02).
- D1 and Supabase Storage are not transactional with each other; see R-08.
- Request bodies are buffered (`formData()`); streaming uploads are out of scope ([11_DECISIONS.md](11_DECISIONS.md) D-004).

Related: [05_ARCHITECTURE.md](05_ARCHITECTURE.md), [16_CONFIG_REFERENCE.md](16_CONFIG_REFERENCE.md), [api.md](../api.md).
