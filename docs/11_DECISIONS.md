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

## D-012 — Purge after uploads instead of requiring a cron (2026-11-06)

- **Decision:** A successful upload starts a throttled background purge (`maybePurge`). The cron trigger is optional and commented out.
- **Context:** The first deployment failed to register the cron: the Cloudflare account is on the Workers Free plan and had used its 5 cron triggers (error 10072).
- **Alternatives rejected:** Upgrading the plan or removing another project's cron (not ours to decide); a Supabase `pg_cron` job (Postgres is not used here).
- **Consequence:** Storage is reclaimed only while uploads happen (R-15). Correctness is unaffected because reads reject expired files.

## D-013 — Frontend on tete.apipedia.id, API and MCP on tetein.apipedia.id (2026-11-06)

- **Decision:** One Worker, two custom domains. Share pages and UI on `tete.apipedia.id`; API, MCP and integrators on `tetein.apipedia.id`. Responses link the share page to the frontend and download/delete to the API host.
- **Context:** Requested by the owner. The UI keeps using same-origin calls on its own host, so cookies need no cross-origin setup.
- **Alternatives rejected:** Two Workers (duplicated deploys and state); a single host for everything (does not give integrators a stable API hostname).
- **Consequence:** Owner cookies are per host: files uploaded through the API host are not "owned" by the browser on the frontend host, so deleting them from the UI needs the delete token or an admin session.

## D-014 — Web UI restyled after apipedia.id (2026-11-06)

- **Decision:** Warm paper background, Fraunces headlines, Geist body, deep-green pill buttons, rounded cards with soft shadows, mint and amber accents, hero with copy on the left and the upload card on the right. Palette and fonts were taken from the apipedia.id stylesheet.
- **Context:** A first redesign used hard offset shadows, square corners and a mono-heavy look; the owner rejected it in favour of the apipedia.id look.
- **Alternatives rejected:** Hard-shadow editorial style (rejected by the owner); a UI framework (not needed for a one-page tool, and there is no build step).

## D-015 — Admin MCP tools behind a static Bearer token (2026-11-06)

- **Decision:** `MCP_TOKEN` (Worker secret) unlocks `list_files`, `get_config`, `update_config`, `purge_expired` and token-less `delete_file` over `/mcp`. Public tools stay open.
- **Context:** The owner wants to control the service from Claude. A static header works in Claude Code and `mcp-remote`.
- **Alternatives rejected:** OAuth for MCP (needed by claude.ai connectors, but a large amount of machinery for one operator); reusing the admin password as the token (would tie the web login to a long-lived machine credential).
- **Consequence:** Anyone with the token has admin-level control of files and limits (R-16). It is separate from the admin password and can be rotated on its own.

## D-016 — Config updates are all-or-nothing (2026-11-06)

- **Decision:** `updateConfig` validates every field, then writes. Found in a live test: a rejected request had already written `defaultExpiration`, silently changing the production default from 1 hour to 30 minutes.
