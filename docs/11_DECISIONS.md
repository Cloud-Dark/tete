# Decisions

> Status: Final
> Last updated: 2026-11-06
> Owner: Cloud-Dark

Architecture decision records. Newest decisions are appended; numbers are permanent.

## D-001 — One Worker serves UI and API (2026-11-06)

- **Decision:** Static Assets for `client/` plus the API in the same Worker.
- **Context:** The old setup used Cloudflare Pages `_redirects` to proxy `/api/*` to a separate Express host and hardcoded `tetein.apipedia.id` in the client.
- **Alternatives rejected:** Pages + Functions (two deployables, cross-origin cookies); keeping Express behind a tunnel (not Workers-only).

## D-002 — R2 for content, D1 for metadata (2026-11-06)

- **Decision:** File bytes in R2 keyed by id; rows and config in D1.
- **Alternatives rejected:** KV (25 MB value limit, eventual consistency, awkward listing); R2-only with custom metadata (no efficient per-owner listing or expiry query).

## D-003 — Stateless signed admin cookie (2026-11-06)

- **Decision:** HMAC-signed cookie with expiry instead of a session store.
- **Alternatives rejected:** Sessions in D1/KV (extra writes and cleanup for a single-admin app). Trade-off: no per-session revocation (R-05).

## D-004 — Buffered uploads with a 50 MB cap (2026-11-06)

- **Decision:** Parse `multipart/form-data` in the Worker; default 25 MB, hard cap 50 MB per file, 60 MB per request.
- **Alternatives rejected:** Streaming/multipart upload straight to R2 or presigned URLs (more moving parts; revisit if larger files are needed).

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
