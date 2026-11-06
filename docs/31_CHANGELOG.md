# Changelog

> Status: Final
> Last updated: 2026-11-06
> Owner: Cloud-Dark

Format: [Keep a Changelog](https://keepachangelog.com/).

## [2.0.0] - 2026-11-06

### Performance

- Purge: Storage objects are deleted before D1 rows, in the background after uploads and optionally by a `*/30` cron.
- D1: reduced to two indexes (`user_id, uploaded_at DESC` and a partial index on `expires_at`); no `SELECT *`; config cached per isolate; list limit 200.
- CPU: owner cookie only on uploads, docs rendered once per isolate, purge cron every 30 minutes (was 5), 10 % log sampling.

### Added

- Storage quota (`STORAGE_QUOTA_BYTES`, default 1 GiB) enforced at upload (`507 Storage is full`), `GET /api/usage`, and a *Resources* panel on the website (storage used and left with a progress bar that turns amber at 80% and red at 95%, files stored, per-file and per-upload limits, default lifetime).
- OAuth 2.1 for MCP: protected resource and authorization server metadata, dynamic client registration, consent screen with admin password, authorization code + PKCE S256, refresh tokens, single-use codes (`oauth_codes`), revocation of all clients (`oauthEpoch`, Admin button, `POST /api/admin/revoke-oauth`).
- `POST /mcp/public`: anonymous endpoint with the five public tools.

### Changed

- **Breaking:** the per-file limit is now **5 MB** (was 25 MB, hard cap 50 MB). The hard cap is 5 MB, so the admin setting accepts 1 to 5 MB; the Supabase bucket enforces 5 MB as well.
- **Breaking:** `POST /mcp` now requires OAuth (or the optional static `MCP_TOKEN`); the anonymous tools moved to `/mcp/public`. All nine tools are available on `/mcp` after sign-in. CORS allows the `Authorization` header and exposes `WWW-Authenticate`.
- MCP admin tools behind `MCP_TOKEN`: `list_files`, `get_config`, `update_config`, `purge_expired`, token-less `delete_file`.
- New web UI: single page, apipedia.id palette and typography, light and dark, hero with upload card, expiry chips, password toggle, real upload progress, one-click file actions, cURL/MCP/Claude Desktop snippets with copy buttons, mobile menu, sticky header with scroll progress, footer and back-to-top. Share page restyled to match.
- Production domains attached to the Worker: `tete.apipedia.id` (frontend) and `tetein.apipedia.id` (API/MCP). Smoke test accepts `FRONTEND_URL`.
- Two-hostname layout: frontend `tete.apipedia.id`, API/MCP `tetein.apipedia.id` on one Worker (`worker/links.js`, `FRONTEND_HOST`, `API_HOST`). API-host `/` returns the API index; browsers on the API host are redirected to the share page.
- Background purge after uploads (`maybePurge`, `PURGE_INTERVAL_MS`), so no cron slot is needed.
- Cloudflare Workers runtime: Worker (`worker/`), Static Assets for `client/`, D1 database, cron purge, `wrangler.toml`.
- File content in a private Supabase Storage bucket, accessed only by the Worker (`worker/storage.js`, `supabase-storage.sql`). Supabase never appears in a public URL.
- MCP server at `POST /mcp` with tools `upload_text`, `upload_base64`, `file_info`, `read_text`, `delete_file` (`worker/mcp.js`).
- `test/fake-supabase.mjs`: local stand-in for Supabase Storage used by the smoke test.
- D1 migration `0001_init.sql` (`files`, `config`).
- One-time delete token returned on upload (`deleteToken`, `deleteUrl?token=`); `X-Delete-Token` header.
- `GET /api/file/:id` JSON endpoint; `X-Password` header for locked downloads.
- Per-owner anonymous cookie (`tete_uid`) and signed admin cookie (`tete_admin`).
- `test/smoke.mjs` (53 checks; passes against `wrangler dev` and the live deployment; waits for the 60 s config cache to settle), usable against local dev and deployed Workers.
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

### Security

- OAuth tokens and admin sessions use purpose-bound signing keys, and the admin cookie requires `role: admin`. Previously any validly signed, unexpired token would have passed as an admin session, which OAuth (open client registration) would have turned into a privilege escalation. Existing admin sessions were invalidated once.

### Fixed

- Admin limits: `POST /api/config` and the MCP `update_config` tool now validate every field before writing; previously a rejected request could still change earlier fields (it changed the live default expiration).
- Admin limits form no longer submits before the current values are loaded (it sent empty values).
- Web UI: garbled characters (`âœ…`, `â‹®`, `ðŸ”’`) in `client/js/app.js`, caused by a double-encoded UTF-8 file with a BOM; the file is now plain UTF-8.
- Web UI: upload result and file list use one shared renderer with SVG icons (no emoji, no bare words like `link`/`del` as icons), a "Locked" badge, and the one-time delete token; the result card now uses the CSS classes that already existed (`.result-block`, `.result-link-card`).
- Web UI: failed uploads always showed "Unknown error" because the client read `message` while the API returns `error`.
- Web UI: failure box used hardcoded light colours; it now uses theme tokens and works in dark mode.
- Security: file names are HTML-escaped when rendered (a name such as `<img onerror=...>` could execute script in the file list, including for an admin viewing other users' files).
- Web UI: menu labels no longer split mid-word ("Li nk") and the actions button stays compact on narrow screens.

- Admin and owner state no longer depends on in-memory sessions that were lost on every restart.
