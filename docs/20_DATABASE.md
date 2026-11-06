# Database

> Status: Final
> Last updated: 2026-11-06
> Owner: Cloud-Dark

D1 database `tete`, migrations in [`migrations/`](../migrations/). Applied with `npm run migrate:local` / `migrate:remote`.

## Table `files`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | 6 hex characters; also the R2 object key |
| `original_name` | TEXT | `NULL` for locked files |
| `mime_type` | TEXT | `application/octet-stream` for locked files |
| `size` | INTEGER | Plaintext size in bytes |
| `uploaded_at` | TEXT | ISO 8601 |
| `expires_at` | INTEGER | Epoch milliseconds; `NULL` = never |
| `user_id` | TEXT | Anonymous owner (`tete_uid` cookie) |
| `delete_token` | TEXT | SHA-256 hex of the delete token |
| `locked` | INTEGER | `1` when password-protected and encrypted |
| `enc` | TEXT | JSON descriptor, locked files only (below) |

Indexes: `idx_files_expires (expires_at)`, `idx_files_user (user_id)`.

### `enc` descriptor

| Field | Meaning |
|-------|---------|
| `v` | Format version (`1`) |
| `iterations` | PBKDF2 iteration count used for this file |
| `salt` | Base64 16-byte PBKDF2 salt |
| `wrappedKey`, `keyIv` | Data key encrypted with the password-derived key (AES-GCM, base64) |
| `iv` | Base64 12-byte IV for the content (R2 object = ciphertext + 16-byte tag) |
| `meta`, `metaIv` | Encrypted JSON `{ name, mime }` |

No password or password hash is stored.

## Table `config`

Key/value overrides written by the admin panel.

| Key | Value |
|-----|-------|
| `defaultExpiration`, `maxFileSize`, `maxFilesPerUpload` | Integer as text |
| `fileWhitelist` | Comma-separated extensions |
| `adminPasswordHash` | `pbkdf2$<iterations>$<salt>$<hash>` |

## R2

Bucket `tete-files`, object key = file id, body = file bytes (unlocked) or ciphertext (locked).
