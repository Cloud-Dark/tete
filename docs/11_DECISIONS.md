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

## D-004 — Buffered uploads with a size cap (2026-11-06; cap lowered to 5 MB by D-019)

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

## D-015 — Admin MCP tools behind a static Bearer token (2026-11-06; superseded by D-017 for `/mcp`)

- **Decision:** `MCP_TOKEN` (Worker secret) unlocks `list_files`, `get_config`, `update_config`, `purge_expired` and token-less `delete_file` over `/mcp`. Public tools stay open.
- **Context:** The owner wants to control the service from Claude. A static header works in Claude Code and `mcp-remote`.
- **Alternatives rejected:** OAuth for MCP (needed by claude.ai connectors, but a large amount of machinery for one operator); reusing the admin password as the token (would tie the web login to a long-lived machine credential).
- **Consequence:** Anyone with the token has admin-level control of files and limits (R-16). It is separate from the admin password and can be rotated on its own.

## D-016 — Config updates are all-or-nothing (2026-11-06)

- **Decision:** `updateConfig` validates every field, then writes. Found in a live test: a rejected request had already written `defaultExpiration`, silently changing the production default from 1 hour to 30 minutes.

## D-017 — OAuth 2.1 with a consent screen for /mcp (2026-11-06)

- **Decision:** `/mcp` is an OAuth 2.1 protected resource (discovery, dynamic client registration, authorization code + PKCE S256, refresh tokens). Approval happens on a consent screen that asks for the admin password. All tools require sign-in; the anonymous tools moved to `/mcp/public`. The static `MCP_TOKEN` remains as an optional fallback for scripts.
- **Context:** The owner asked for OAuth with a consent screen. claude.ai connectors and Claude Code only start OAuth when the server answers `401` to an unauthenticated request, so one URL cannot be both anonymous and OAuth-protected; hence the split.
- **Alternatives rejected:** Keeping only the static token (no consent, not supported by claude.ai connectors); a "mixed" `/mcp` that is anonymous with optional OAuth (clients would never start the flow); storing clients and tokens in D1 (more writes and cleanup; stateless signed tokens plus a revocation epoch cover the need).
- **Consequence:** Breaking change for anyone who used `/mcp` anonymously: use `/mcp/public`. Dynamic registration is open by protocol design, so safety rests on the consent screen: admin password on every approval, signed approval request, exact redirect matching, frame denial, short single-use codes (R-17).

## D-018 — Signing keys are bound to a purpose (2026-11-06)

- **Decision:** `signToken` / `verifyToken` derive the HMAC key from `SESSION_SECRET` plus a purpose label (`admin-session`, `oauth-client`, `oauth-txn`, `oauth-code`, `oauth-access`, `oauth-refresh`), and the admin cookie additionally requires `role: admin`.
- **Context:** Before OAuth, any validly signed unexpired token was accepted as an admin session. With OAuth, anyone can obtain signed values (a registered client id), so this would have been privilege escalation. Covered by smoke checks that present an access token and a client id as an admin cookie.
- **Consequence:** Existing admin sessions were invalidated once at deployment (admins log in again).

## D-019 — 5 MB per file and a visible storage quota (2026-11-06; the 5 MB part superseded by D-020)

- **Decision:** `HARD_MAX_FILE_BYTES` is 5 MB and the default per-file limit is 5 MB; the Supabase bucket limit is 5 MB too. A soft storage quota (`STORAGE_QUOTA_BYTES`, default 1 GiB) is enforced at upload with `507`, and `GET /api/usage` plus a *Resources* panel on the website show used, left, files stored and the active limits.
- **Context:** The owner asked for a 5 MB maximum and to show the remaining resources in the UI. "Resources" is taken as storage and the limits that apply to an upload; request counts of the hosting platforms are not exposed because the Worker cannot read them.
- **Alternatives rejected:** Reading real usage from the Supabase Management API (needs another credential); a per-request 5 MB total (the request said "max 5 MB", read as per file; a multi-file upload can still add up to 50 MB).
- **Consequence:** Anything larger than 5 MB is rejected with `413`. Files uploaded earlier are unaffected. The quota is TETE's own count, see R-18.

## D-020 — Roles: public 25 MB and 7 days, admin unlimited; admin dashboard (2026-11-06)

- **Decision:** Public uploads: at most 25 MB per file, at most 7 days, no "Never", counted against the quota. Admins: no size limit from TETE for files without a password (raw body streamed to storage by `POST /api/admin/upload`), any lifetime including Never, not counted against the quota. Files with a password stay at 25 MB for everyone because they are encrypted in memory. A dedicated `/admin` dashboard replaces the admin section of the main page and shows real Supabase bucket usage.
- **Context:** The owner replaced the earlier 5 MB limit (D-019) with 25 MB for the public and "unlimited" for the admin, and asked for a proper dashboard that also shows what is left in Supabase Storage.
- **Alternatives rejected:** Raising the buffered limit for admins (Worker memory is 128 MB, so 60 MB or more would crash); client-side chunking or presigned direct-to-Supabase uploads (more moving parts and would expose the Supabase hostname); reading project-wide usage from the Supabase Management API (needs another credential).
- **Consequence:** "Unlimited" means TETE adds no limit. The practical ceiling is the storage provider's per-object limit on the plan and Cloudflare's request size limit (R-19). The bucket limit was raised to 50 MB, the Supabase Free ceiling (to verify).
