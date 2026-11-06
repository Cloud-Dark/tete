# Database

> Status: Final
> Last updated: 2026-11-06
> Owner: Cloud-Dark

D1 database `tete`, migrations in [`migrations/`](../migrations/). Applied with `npm run migrate:local` / `migrate:remote`.

## Table `files`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | 6 hex characters; also the Supabase Storage object name |
| `original_name` | TEXT | `NULL` for locked files |
| `mime_type` | TEXT | `application/octet-stream` for locked files |
| `size` | INTEGER | Plaintext size in bytes |
| `uploaded_at` | TEXT | ISO 8601 |
| `expires_at` | INTEGER | Epoch milliseconds; `NULL` = never |
| `user_id` | TEXT | Anonymous owner (`tete_uid` cookie) |
| `delete_token` | TEXT | SHA-256 hex of the delete token |
| `locked` | INTEGER | `1` when password-protected and encrypted |
| `enc` | TEXT | JSON descriptor, locked files only (below) |

Indexes (deliberately only two: each index adds one written row to every upload):

| Index | Serves | Query plan |
|-------|--------|------------|
| `idx_files_user_uploaded (user_id, uploaded_at DESC)` | Owner listing, already newest-first | `SEARCH ... USING INDEX`, no sort step |
| `idx_files_expiring (expires_at) WHERE expires_at IS NOT NULL` | Cron purge; stays empty for never-expiring files | `SEARCH ... USING INDEX` |

Reads by id use the primary key. The admin "all files" list is a bounded scan (200 rows) of a table that only holds
temporary files, so it has no dedicated index.

### Config cache and admin changes

Runtime config is cached per isolate for 60 seconds. A change saved in the admin panel applies immediately in the isolate
that handled it and in all others within 60 seconds. The value in D1 is always current.

### Query rules

- Never `SELECT *`: the `enc` blob and `delete_token` are fetched only by the endpoints that need them.
- Runtime config is cached per isolate for 60 s, so uploads do not query D1 for config.
- `config` is `WITHOUT ROWID`; the admin password hash is excluded from the config query.

### `enc` descriptor

| Field | Meaning |
|-------|---------|
| `v` | Format version (`1`) |
| `iterations` | PBKDF2 iteration count used for this file |
| `salt` | Base64 16-byte PBKDF2 salt |
| `wrappedKey`, `keyIv` | Data key encrypted with the password-derived key (AES-GCM, base64) |
| `iv` | Base64 12-byte IV for the content (Storage object = ciphertext + 16-byte tag) |
| `meta`, `metaIv` | Encrypted JSON `{ name, mime }` |

No password or password hash is stored.

## Table `oauth_codes`

| Column | Type | Notes |
|--------|------|-------|
| `jti` | TEXT PK | Id of an authorization code; inserted when the code is redeemed, so a replay finds it taken |
| `exp` | INTEGER | Epoch ms when the code could no longer be redeemed; rows are purged with the expired files |

## Table `config`

Key/value overrides written by the admin panel.

| Key | Value |
|-----|-------|
| `defaultExpiration`, `maxFileSize`, `maxFilesPerUpload` | Integer as text |
| `fileWhitelist` | Comma-separated extensions |
| `oauthEpoch` | Integer as text. Every OAuth token carries the epoch it was issued under; incrementing it signs out all clients |
| `adminPasswordHash` | `pbkdf2$<iterations>$<salt>$<hash>` |

## Supabase Storage

Private bucket `tete` (created by `supabase-storage.sql`, 50 MB per object, the Supabase Free ceiling; TETE enforces 25 MB for public uploads itself). Object name = file id; body = file bytes
(unlocked) or ciphertext (locked). The bucket has no policies: only the Worker, with the service-role key, can access it.
