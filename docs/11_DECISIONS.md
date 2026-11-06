# Decisions

> Status: Final
> Last updated: 2026-11-06
> Owner: Cloud-Dark

Architecture decision records. Newest decisions are appended; numbers are permanent.

## D-001 — One Worker serves UI and API (2026-11-06)

- **Decision:** Static Assets for `client/` plus the API in the same Worker.
- **Context:** The old setup used Cloudflare Pages `_redirects` to proxy `/api/*` to a separate Express host and hardcoded `tetein.apipedia.id` in the client.
- **Alternatives rejected:** Pages + Functions (two deployables, cross-origin cookies); keeping Express behind a tunnel (not Workers-only).

## D-002 — Object storage for content, D1 for metadata (2026-11-06)

- **Decision:** File bytes in an object store keyed by id; rows and config in D1. _Superseded in part by D-010: the object store is Supabase Storage, not R2._
- **Alternatives rejected:** KV (25 MB value limit, eventual consistency, awkward listing); R2-only with custom metadata (no efficient per-owner listing or expiry query).

## D-003 — Stateless signed admin cookie (2026-11-06)

- **Decision:** HMAC-signed cookie with expiry instead of a session store.
- **Alternatives rejected:** Sessions in D1/KV (extra writes and cleanup for a single-admin app). Trade-off: no per-session revocation (R-05).

## D-004 — Buffered uploads with a 50 MB cap (2026-11-06)

- **Decision:** Parse `multipart/form-data` in the Worker; default 25 MB, hard cap 50 MB per file, 60 MB per request.
- **Alternatives rejected:** Streaming/multipart upload straight to object storage or presigned URLs (more moving parts; revisit if larger files are needed).

## D-005 — Locked files hide name and MIME, store no password hash (2026-11-06)

- **Decision:** Encrypt `{name, mime}` together with the content key; verify a password by unwrapping the key.
- **Context:** The Express version stored `originalName` in plaintext and a bare SHA-256 of the password, contradicting the documented "filename encryption".
- **Consequence:** Listings show locked files as `<id>.enc`; the real name appears only in the upload response and the download headers.

## D-006 — Delete needs owner, admin, or delete token (2026-11-06)

- **Decision:** `DELETE /file/:id` is authorised by the owner cookie, an admin session, or a one-time delete token (stored hashed).
- **Context:** Previously anyone who knew a 6-hex id could delete the file.
- **Consequence:** Breaking change for scripts that deleted by id alone; they must keep `deleteToken`.

## D-007 — Remove the Express server and JSON-file storage (2026-11-06)

- **Decision:** Delete `server/`, `db/`, `_redirects`, Express dependencies and PM2/Nginx instructions.
- **Rationale:** Disk, in-memory sessions and `fs` are unavailable on Workers; keeping them would leave two unmaintained code paths.

## D-008 — No default admin password (2026-11-06)

- **Decision:** Admin login works only when `SESSION_SECRET` is set; the initial password is the `ADMIN_PASSWORD` secret, replaced by a salted hash in D1 once changed. Minimum new password length is 8.
- **Context:** `admin123` was hardcoded and documented.

## D-009 — Resource-lean D1 and CPU usage (2026-11-06)

- **Decision:** Two indexes only (owner listing, partial expiry index), narrow `SELECT` lists, per-isolate config cache (60 s), list limit 200, cron every 30 minutes, log sampling at 10 %.
- **Context:** Requirement to minimise database and CPU cost. Measured locally: an unlocked upload takes about 9 ms wall time, a locked one about 27 ms; one PBKDF2 derivation at 100,000 iterations costs about 17 ms CPU.
- **Alternatives rejected:** Lowering the default `PBKDF2_ITERATIONS` (fits the Free plan's 10 ms CPU limit at roughly 10,000 iterations, but makes weak file passwords far easier to brute-force); a dedicated index for the admin list (extra write per upload for a rarely used view).
- **Consequence:** Locked uploads and admin password changes still need the Paid plan, or a lower `PBKDF2_ITERATIONS` chosen by the operator ([10_RISK_REGISTER.md](10_RISK_REGISTER.md) R-02).

## D-010 — Supabase Storage for file content, everything else on Cloudflare (2026-11-06)

- **Decision:** File bytes live in a private Supabase Storage bucket `tete`. The Worker is the only client (service-role key as a secret); metadata, config, auth, expiry and the UI stay on Cloudflare (Worker + D1). Public URLs are always `tete.apipedia.id/...`.
- **Context:** R2 could not be enabled on the Cloudflare accounts (error 10042, needs the dashboard and a payment method). An Edge-Function-based API on Supabase was prototyped and dropped: it would have moved the database and auth to Supabase, put Supabase-specific code paths in front of every request, and broken the "Supabase only stores files" requirement.
- **Alternatives rejected:** R2 (blocked, may return: only `worker/storage.js` would change); Supabase Edge Function + Postgres behind a Worker proxy (more moving parts, two runtimes); letting browsers upload directly to Supabase (would expose its hostname and need signed URLs).
- **Consequence:** One extra network hop per transfer, a second vendor to operate, and Free-plan pause risk (R-11, R-12, R-13).

## D-011 — MCP endpoint reuses the REST handlers (2026-11-06)

- **Decision:** `POST /mcp` (stateless Streamable HTTP, JSON responses) implements `initialize`, `ping`, `tools/list` and `tools/call` and calls the REST handlers internally.
- **Rationale:** One code path for limits, encryption, expiry and errors; no session state to store. Deletion through MCP requires the delete token because MCP clients carry no cookie.
