# Configuration Reference

> Status: Final
> Last updated: 2026-11-06
> Owner: Cloud-Dark

## Precedence

1. Values saved from the admin **Config** tab (table `config` in D1) win.
2. Otherwise the `[vars]` in `wrangler.toml` apply.
3. Otherwise the built-in defaults below.

Only the first four settings can be changed at runtime; the rest require a redeploy or a secret update. `SUPABASE_URL` is a plain variable (it is a hostname, not a secret).

## Variables (`wrangler.toml` `[vars]`)

| Name | Default | Runtime override | Description |
|------|---------|------------------|-------------|
| `DEFAULT_EXPIRATION_MS` | `3600000` | `defaultExpiration` | Expiry when an upload gives none. `0` = never |
| `MAX_FILE_SIZE_BYTES` | `26214400` | `maxFileSize` | Per-file limit; capped at 50 MB (52428800) |
| `MAX_FILES_PER_UPLOAD` | `10` | `maxFilesPerUpload` | Files per request (request total capped at 60 MB) |
| `FILE_WHITELIST` | empty | `fileWhitelist` | Comma-separated extensions without dots; empty allows all |
| `SUPABASE_URL` | – (set in `wrangler.toml`) | – | Supabase project URL, e.g. `https://<ref>.supabase.co`. Server-side only |
| `PURGE_INTERVAL_MS` | `600000` | – | Minimum gap between background purges per isolate |
| `PBKDF2_ITERATIONS` | `100000` | – | Cost for locked files and the admin password. Stored per file, so changing it never breaks existing files |

## Secrets (`wrangler secret put`, or `.dev.vars` locally)

| Name | Required | Description |
|------|----------|-------------|
| `SESSION_SECRET` | Yes (for admin) | At least 16 characters, 32+ recommended. Signs the admin cookie. Rotating it logs every admin out |
| `SUPABASE_SERVICE_KEY` | Yes | `service_role` key of the Supabase project. Never exposed to browsers |
| `ADMIN_PASSWORD` | Yes (first login) | Initial admin password. After "Change Password" in the UI, the hash in D1 takes over and this secret is ignored |

## Bindings

| Binding | Type | Purpose |
|---------|------|---------|
| `ASSETS` | Static Assets (`client/`) | Web UI |
| `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` | Supabase Storage bucket `tete` (private) | File content |
| `DB` | D1 (`tete`) | `files` and `config` tables |

## Purging expired files

| Mechanism | Default | Notes |
|-----------|---------|-------|
| Background purge after uploads | On | Throttled by `PURGE_INTERVAL_MS` (default `600000`, 10 minutes, per isolate) |
| Cron `*/30 * * * *` | Off (commented in `wrangler.toml`) | Needs a free cron slot (Free plan: 5 per account) or the Paid plan |

## Cookies

| Cookie | Lifetime | Purpose |
|--------|----------|---------|
| `tete_uid` | 30 days | Anonymous owner id (`HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS) |
| `tete_admin` | 24 hours | Signed admin session |

## Hard limits in code

| Limit | Value | Where |
|-------|-------|-------|
| Max file size | 50 MB | `HARD_MAX_FILE_BYTES` in `worker/config.js` |
| Max request size | 60 MB | `TOTAL_REQUEST_CAP` in `worker/config.js` |
| Admin session | 24 h | `ADMIN_SESSION_MS` in `worker/config.js` |
| Min admin password | 8 chars | `worker/admin.js` |
| List size | 200 files | `worker/files.js` |
