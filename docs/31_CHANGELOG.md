# Changelog

> Status: Final
> Last updated: 2026-11-06
> Owner: Cloud-Dark

Format: [Keep a Changelog](https://keepachangelog.com/).

## [2.0.0] - 2026-11-06

### Performance

- Purge: `*/30` cron deletes Storage objects before D1 rows.
- D1: reduced to two indexes (`user_id, uploaded_at DESC` and a partial index on `expires_at`); no `SELECT *`; config cached per isolate; list limit 200.
- CPU: owner cookie only on uploads, docs rendered once per isolate, purge cron every 30 minutes (was 5), 10 % log sampling.

### Added

- Cloudflare Workers runtime: Worker (`worker/`), Static Assets for `client/`, D1 database, cron purge, `wrangler.toml`.
- File content in a private Supabase Storage bucket, accessed only by the Worker (`worker/storage.js`, `supabase-storage.sql`). Supabase never appears in a public URL.
- MCP server at `POST /mcp` with tools `upload_text`, `upload_base64`, `file_info`, `read_text`, `delete_file` (`worker/mcp.js`).
- `test/fake-supabase.mjs`: local stand-in for Supabase Storage used by the smoke test.
- D1 migration `0001_init.sql` (`files`, `config`).
- One-time delete token returned on upload (`deleteToken`, `deleteUrl?token=`); `X-Delete-Token` header.
- `GET /api/file/:id` JSON endpoint; `X-Password` header for locked downloads.
- Per-owner anonymous cookie (`tete_uid`) and signed admin cookie (`tete_admin`).
- `test/smoke.mjs` (53 checks), usable against local dev and deployed Workers.
- Numbered documentation under `docs/` and a UAT record.

### Changed

- UI and API are served by one Worker on one origin; the client no longer hardcodes `tetein.apipedia.id`.
- Locked files now encrypt the real filename and MIME type; the plaintext name is no longer stored in metadata.
- Locked-file passwords are verified by key unwrapping; the SHA-256 password hash is no longer stored.
- Admin password comes from the `ADMIN_PASSWORD` secret, then a salted PBKDF2 hash in D1; minimum length is 8.
- `GET /file/:id` returns JSON to non-browser clients (curl used to receive HTML).
- Default limits: 25 MB per file (hard cap 50 MB), 10 files and 60 MB per request.
- `Content-Disposition` is sanitised and UTF-8 aware; downloads send `nosniff`.
- File-view page downloads via `fetch`, so a wrong password shows an error instead of saving an error file.
- README, `AGENT.md` and `api.md` rewritten to match the code.

### Removed

- Express server (`server/`), JSON-file storage (`db/`), Cloudflare Pages `_redirects`, PM2/Nginx instructions and the Express dependencies.
- Hardcoded `admin123` password and the committed admin hash/session secret (still present in git history; see [10_RISK_REGISTER.md](10_RISK_REGISTER.md) R-06).
- Client calls to endpoints that never existed on the server: `POST /api/session`, `/api/storage/:id`.

### Security

- `DELETE /file/:id` now requires the owner, an admin, or the delete token (breaking change for scripts that deleted by id alone).

### Fixed

- Admin and owner state no longer depends on in-memory sessions that were lost on every restart.
