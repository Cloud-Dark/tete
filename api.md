# TETE API

> Base URL: `{{BASE_URL}}`. In production, use **`https://tetein.apipedia.id`** for the API and MCP; the web UI and share pages live on `https://tete.apipedia.id`. Both hostnames are the same Cloudflare Worker.

TETE (Transient Endpoint for Transfer & Encryption) is a temporary file-sharing service. Files are stored in
a private Supabase Storage bucket (never exposed to clients), metadata in D1, and deleted automatically when they expire.

## Conventions

| Topic | Behaviour |
|-------|-----------|
| File ID | 6 lowercase hex characters, e.g. `a1b2c3` |
| Errors | JSON `{ "error": "message" }` with the matching HTTP status |
| CORS | `Access-Control-Allow-Origin: *`, no credentials. Cookies only work on the same origin |
| Links | `url` (share page) points at the frontend host `tete.apipedia.id`; `downloadUrl` and `deleteUrl` point at the API host `tetein.apipedia.id`. On other hosts (e.g. workers.dev) all links use that host |
| Identity | An anonymous `tete_uid` cookie marks you as the owner of your uploads. curl users can ignore it and use the delete token |
| Expiration | `expiration` is milliseconds. Omitted or empty = server default, `0` = never expires |
| Limits (public) | **25 MB per file** (admins can lower it, never raise it), 10 files per request, 60 MB per request, 1 GiB of storage in total (`507` when full). Files with a password are limited to 25 MB for everyone |
| Lifetime (public) | `expiration` of at most **7 days**. `0` (never) is refused with `403`; only an admin may keep a file forever. The default lifetime is capped at 7 days for public uploads |
| Admin | No size limit for files without a password (`POST /api/admin/upload`), any lifetime, no quota |

## Upload

### `POST /api` — upload one or more files

`multipart/form-data`, field `file` (or `files`). Optional fields: `password`, `expiration`.

```bash
curl -F "file=@report.pdf" {{BASE_URL}}/api
curl -F "file=@secret.txt" -F "password=s3cret" -F "expiration=7200000" {{BASE_URL}}/api
```

Returns one object for a single file, or an array for several:

```json
{
  "id": "a1b2c3",
  "originalName": "report.pdf",
  "mimeType": "application/pdf",
  "size": 1024,
  "uploadedAt": "2026-11-06T10:30:00.000Z",
  "expiresAt": 1793961000000,
  "locked": false,
  "encrypted": false,
  "url": "{{BASE_URL}}/file/a1b2c3",
  "downloadUrl": "{{BASE_URL}}/file/a1b2c3/download",
  "deleteUrl": "{{BASE_URL}}/file/a1b2c3?token=9f2c...",
  "deleteToken": "9f2c..."
}
```

`deleteUrl` and `deleteToken` are returned **only at upload time** and cannot be recovered. `expiresAt` is epoch
milliseconds, or `null` when the file never expires.

### `POST /api/upload` — same as above

Identical behaviour; kept for the web UI. Field name `files`.

```bash
curl -F "files=@a.txt" -F "files=@b.txt" {{BASE_URL}}/api/upload
```

### `POST /api/text` — upload text

JSON body: `text` (required), `filename`, `password`, `expiration`.

```bash
curl -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "filename": "greeting.txt"}' \
  {{BASE_URL}}/api/text
```

## Read

### `GET /api/file/:id` — file info

```bash
curl {{BASE_URL}}/api/file/a1b2c3
```

```json
{
  "id": "a1b2c3",
  "originalName": "report.pdf",
  "mimeType": "application/pdf",
  "size": 1024,
  "uploadedAt": "2026-11-06T10:30:00.000Z",
  "expiresAt": 1793961000000,
  "locked": false,
  "encrypted": false,
  "url": "{{BASE_URL}}/file/a1b2c3",
  "downloadUrl": "{{BASE_URL}}/file/a1b2c3/download"
}
```

For a **locked** file the real name and MIME type are encrypted: `originalName` is `<id>.enc` and `mimeType` is
`application/octet-stream` until the file is downloaded with the right password.

`GET /file/:id` returns the same JSON to API clients, and the HTML file page to browsers
(`Sec-Fetch-Dest: document`, or an `Accept` header that names `text/html`).

### `GET /file/:id/download` — download

```bash
curl -OJ {{BASE_URL}}/file/a1b2c3/download
curl -OJ "{{BASE_URL}}/file/a1b2c3/download?password=s3cret"   # locked file
curl -OJ -H "X-Password: s3cret" {{BASE_URL}}/file/a1b2c3/download   # keeps the password out of URLs/logs
```

Locked files are decrypted on the fly; the original filename and MIME type are restored in the response headers.
A wrong or missing password returns `401`.

### `POST /file/:id/verify` — check a password without downloading

```bash
curl -H "Content-Type: application/json" -d '{"password": "s3cret"}' {{BASE_URL}}/file/a1b2c3/verify
```

`200 { "success": true }` when the file is unlocked or the password is right, `401` otherwise.

### `GET /api/usage` — what is left

Public, aggregates only (no file names). Counts live, non-expired files; cached for up to 15 seconds per instance.

```bash
curl {{BASE_URL}}/api/usage
```

```json
{
  "storage": { "usedBytes": 26214400, "quotaBytes": 1073741824, "remainingBytes": 1047527424, "files": 5 },
  "limits":  { "maxFileSize": 5242880, "maxFilesPerUpload": 10, "defaultExpiration": 3600000 }
}
```

### `GET /api/files` — list your files

Returns an array of file-info objects: the files owned by the caller's cookie. An admin session sees every file
(up to 200, newest first). Expired files are never listed.

## Delete

### `DELETE /file/:id`

Allowed for any one of:

1. the owner (same `tete_uid` cookie that uploaded the file),
2. an admin session,
3. the holder of the delete token: `?token=<token>` or header `X-Delete-Token: <token>`.

```bash
curl -X DELETE "{{BASE_URL}}/file/a1b2c3?token=9f2c..."
```

Anything else returns `403`.

## Admin

### Dashboard

`https://tete.apipedia.id/admin` is the admin dashboard (sign in with the admin password): overview, real Supabase Storage left,
every file with search, filters, sorting and bulk delete, limits, password and connected applications.

### Upload without a size limit

`POST /api/admin/upload` (admin session): the raw request body is **streamed** to storage, so any size the storage provider and
Cloudflare accept. No password support (use `POST /api` for files with a password, 25 MB). Headers: `Content-Length` (required),
`Content-Type`, `X-File-Name` (URL-encoded), optional `X-Expiration` (ms, `0` = never). Returns the same object as `POST /api`.

```bash
curl -b cookies.txt -X POST --data-binary @big.iso \
  -H "Content-Type: application/octet-stream" -H "X-File-Name: big.iso" -H "X-Expiration: 0" \
  {{BASE_URL}}/api/admin/upload
```

### Statistics and real storage left

| Method | Path | Result |
|--------|------|--------|
| GET | `/api/admin/stats` | `files`, `bytes`, `public`, `locked`, `neverExpire`, `expiringWithinHour`, `uploadedLast24h`, `largestBytes` (live files, one query) |
| GET | `/api/admin/storage` | What **Supabase itself** reports for the bucket: `usedBytes`, `objects`, `quotaBytes`, `remainingBytes`, `checkedAt`. Cached 20 s, add `?fresh=1` to force a re-check. Counts the TETE bucket only, not other buckets of the project |


Admin endpoints use a signed `tete_admin` cookie (24 h). Use `-c cookies.txt` / `-b cookies.txt` with curl.

| Method | Path | Body | Notes |
|--------|------|------|-------|
| POST | `/api/admin/login` | `{ "password" }` | Sets the admin cookie |
| POST | `/api/admin/logout` | – | Clears the cookie |
| GET | `/api/admin/status` | – | `{ "isAdmin": true/false }` |
| POST | `/api/admin/verify-password` | `{ "password" }` | Admin only |
| POST | `/api/admin/revoke-oauth` | – | Admin only. Signs out every OAuth-connected MCP application |
| POST | `/api/admin/change-password` | `{ "newPassword" }` | Admin only, min. 8 characters. Overrides the `ADMIN_PASSWORD` secret from then on |
| GET | `/api/config` | – | Admin only |
| POST | `/api/config` | any of the fields below | Admin only. All fields are validated first; a rejected request changes nothing |

Config fields: `defaultExpiration` (ms), `maxFileSize` (public limit, MB, or bytes when the value is above 1000; 1 to 25 MB),
`maxFilesPerUpload`, `fileWhitelist` (`"png,pdf"` or array; empty allows every extension).

```bash
curl -c cookies.txt -H "Content-Type: application/json" -d '{"password": "..."}' {{BASE_URL}}/api/admin/login
curl -b cookies.txt -H "Content-Type: application/json" -d '{"maxFileSize": 10}' {{BASE_URL}}/api/config
```

## MCP

Model Context Protocol, Streamable HTTP transport, stateless, JSON responses.

| Endpoint | Access | Tools |
|----------|--------|-------|
| `POST /mcp` | OAuth 2.1 access token (or the static `MCP_TOKEN`) | all 10 |
| `POST /mcp/public` | none | the 5 public tools |

```bash
claude mcp add --transport http tete {{BASE_URL}}/mcp        # then /mcp -> tete -> Authenticate
claude mcp add --transport http tete-public {{BASE_URL}}/mcp/public
```

| Tool | Arguments | Result |
|------|-----------|--------|
| `upload_text` | `text`, `filename?`, `password?`, `expiration_ms?` | Same object as `POST /api/text` |
| `upload_base64` | `filename`, `content_base64`, `mime_type?`, `password?`, `expiration_ms?` | Same object as `POST /api` |
| `file_info` | `id` | Same object as `GET /api/file/:id` |
| `read_text` | `id`, `password?` | `{ "text": "..." }` for text files up to 1 MB |
| `delete_file` | `id`, `token` (optional after sign-in) | `{ "success": true }` |
| `list_files` | – | Every file, all owners (up to 200, newest first). Sign-in only |
| `get_config` | – | Runtime limits. Sign-in only |
| `update_config` | `defaultExpiration?`, `maxFileSize?` (MB), `maxFilesPerUpload?`, `fileWhitelist?` | New limits; a rejected request changes nothing. Sign-in only |
| `purge_expired` | – | `{ "purged": <count> }`. Sign-in only |
| `storage_usage` | – | Real bucket usage from Supabase: used, quota, remaining, objects. Sign-in only |

Tool failures are `isError: true` results with the same messages as the REST errors. A tool that needs sign-in, called on
`/mcp/public`, returns a tool error.

### OAuth 2.1 (for `/mcp`)

| Step | Endpoint |
|------|----------|
| Discovery (RFC 9728) | `GET /.well-known/oauth-protected-resource` → `{ resource, authorization_servers }` |
| Server metadata (RFC 8414) | `GET /.well-known/oauth-authorization-server` |
| Client registration (RFC 7591) | `POST /oauth/register` `{ client_name, redirect_uris }` → `client_id` (public client, no secret) |
| Authorization | `GET /oauth/authorize?response_type=code&client_id&redirect_uri&code_challenge&code_challenge_method=S256&state` shows the consent screen; the admin password approves it; the browser returns to `redirect_uri` with `code`, `state` and `iss` |
| Token | `POST /oauth/token` (`application/x-www-form-urlencoded`): `authorization_code` with `code_verifier`, or `refresh_token` |

- Redirect URIs must be `https`, or `http` on `localhost` / `127.0.0.1` / `[::1]`, and must match the registration exactly.
- PKCE with `S256` is mandatory. Authorization codes live 60 s and work once. Access tokens last 1 hour, refresh tokens 30 days.
- A signed-out application (Admin → *Sign out all connected applications*) loses access at once.
- Without a valid token `/mcp` answers `401` with `WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource"`.
- Scripts may instead send `Authorization: Bearer <MCP_TOKEN>` if that secret is configured.

## Documentation endpoints

`GET /README.md`, `GET /api.md`, `GET /AGENT.md` — Markdown, with `{{BASE_URL}}` filled in.

## Status codes

| Code | Meaning |
|------|---------|
| 200 | OK |
| 400 | Bad input (missing file/text, bad JSON, extension not allowed, bad `expiration`) |
| 401 | Missing/invalid file password or admin password |
| 403 | Not owner / not admin / missing delete token / public `expiration=0` |
| 404 | Unknown ID, expired file, unknown route |
| 413 | Public file or text over 25 MB, a file with a password over 25 MB, a request over the size limit, or a file the storage provider refuses |
| 507 | Storage quota is full |
| 503 | Admin not configured, or no free file ID (retry) |
