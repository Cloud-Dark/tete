# TETE — Agent Reference

Context file for AI agents and scripts. API base URL: `{{BASE_URL}}`. Production: API and MCP at `https://tetein.apipedia.id`, web UI and share pages at `https://tete.apipedia.id` (one Worker serves both).
Full endpoint reference: `{{BASE_URL}}/api.md`.

## What it is

TETE is a temporary file-sharing service that runs entirely on **Cloudflare Workers**: one Worker serves the web
UI (static assets), the REST API and an MCP server; metadata lives in **D1**, file content in a private **Supabase Storage** bucket (only the Worker talks to it); expired files are purged in the background (and optionally by cron). Supabase is never exposed. Use the API host for programmatic access; share links returned as `url` point to the frontend host.

## Quick recipes

```bash
# Upload (public)
curl -F "file=@document.pdf" {{BASE_URL}}/api

# Upload locked (AES-256-GCM, password required to download) and expiring in 2 hours
curl -F "file=@secret.pdf" -F "password=pass123" -F "expiration=7200000" {{BASE_URL}}/api

# Upload text
curl -H "Content-Type: application/json" -d '{"text":"hello","filename":"note.txt"}' {{BASE_URL}}/api/text

# Info / download / delete
curl {{BASE_URL}}/api/file/a1b2c3
curl -OJ {{BASE_URL}}/file/a1b2c3/download
curl -OJ -H "X-Password: pass123" {{BASE_URL}}/file/a1b2c3/download
curl -X DELETE "{{BASE_URL}}/file/a1b2c3?token=<deleteToken from the upload response>"
```

Always keep `deleteToken` / `deleteUrl` from the upload response: it is shown once.

## MCP

`POST {{BASE_URL}}/mcp` (Streamable HTTP, JSON responses). Tools: `upload_text`, `upload_base64`, `file_info`, `read_text`, `delete_file`.
They behave exactly like the REST endpoints; keep the `deleteToken` from the upload result.

## Rules an agent must know

1. IDs are 6 hex characters. Unlocked files are readable by **anyone who knows the ID**.
2. `expiration` is in milliseconds; `0` means never; omitted means the server default (1 hour unless changed).
3. Locked files: content **and** the real filename/MIME type are encrypted. The server never stores the password.
   A lost password means the file cannot be recovered.
4. Deleting needs the owner cookie, an admin session, or the delete token. Plain `DELETE /file/:id` from a stranger is `403`.
5. Limits: 25 MB per file by default (hard cap 50 MB), 10 files and 60 MB per request.
6. Errors are `{ "error": "..." }`. Do not retry `4xx`; `503` is retryable.

## Architecture in one screen

```
Browser / curl ──► Cloudflare Worker (worker/index.js)
                     ├─ static UI      ◄── ASSETS binding  (client/)
                     ├─ metadata+config◄─► D1  binding DB      (tables: files, config)
                     ├─ file bytes     ◄─► Supabase Storage (bucket tete, key = file id)
                     ├─ /mcp           ──► MCP tools over the same handlers
                     └─ purge expired files after uploads (+ optional cron)
```

## Repository layout

```
worker/index.js     entry point + routing + scheduled handler
worker/files.js     upload, info, verify, download, delete, list, purge
worker/admin.js     admin login/session, password change, runtime config
worker/auth.js      owner cookie, signed admin session
worker/links.js     public link building for the two hostnames
worker/storage.js   Supabase Storage client (put/get/delete)
worker/mcp.js       MCP server (JSON-RPC over POST /mcp)
worker/crypto.js    AES-256-GCM, PBKDF2, HMAC, hashing (WebCrypto)
worker/config.js    defaults from wrangler vars + overrides stored in D1
worker/http.js      JSON/CORS/cookie helpers
client/             static web UI (index, file-view, readme)
migrations/         D1 schema
wrangler.toml       bindings, assets, cron, default vars
test/smoke.mjs      end-to-end smoke test (local or deployed)
docs/               numbered project documentation
```

## Develop and deploy

```bash
npm install
cp .dev.vars.example .dev.vars        # local secrets
npm run migrate:local && npm run dev   # http://localhost:8787
npm run test:smoke                     # in another terminal

# Supabase: run supabase-storage.sql once, set SUPABASE_URL in wrangler.toml
npx wrangler d1 create tete            # put database_id in wrangler.toml
npx wrangler secret put SESSION_SECRET
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SUPABASE_SERVICE_KEY
npm run migrate:remote && npm run deploy
BASE_URL=https://<your-host> ADMIN_PASSWORD=... npm run test:smoke
```

Details: `docs/18_INSTALLATION.md`.
