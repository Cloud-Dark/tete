# TETE - Transient Endpoint for Transfer & Encryption

> Temporary file sharing with optional password encryption. The app runs on **Cloudflare Workers** (UI, API, MCP, D1 metadata); file content is kept in a private **Supabase Storage** bucket. Users only ever see `tete.apipedia.id`.

<img width="1763" height="1674" alt="image" src="https://github.com/user-attachments/assets/20085d0c-f2b8-4351-b5d7-f3b75ac2d266" />

| Service | URL |
|---------|-----|
| Web UI and share links | `https://tete.apipedia.id` (e.g. `/file/a1b2c3`) |
| API, MCP, integrators | `https://tetein.apipedia.id` (`/api`, `/mcp`, `/file/:id/download`) |

Both hostnames are served by the same Worker. API responses point `url` (the share page) at the frontend host and
`downloadUrl` / `deleteUrl` at the API host. Browsers that open an API-host share link are redirected to the frontend.

---

## How it works

One Worker does everything. There is no server to run.

```
Browser / curl ──► Cloudflare Worker (worker/index.js)
                     ├─ web UI         ◄── static assets  (client/)
                     ├─ metadata       ◄─► D1  database (files, config)
                     ├─ file content   ◄─► Supabase Storage (private bucket, server-side only)
                     └─ expired files purged after uploads (and by cron, optional)
```

1. **Upload** a file or text (UI or `curl`). You get a 6-character ID, a link, and a one-time **delete token**.
2. With a **password**, the content is encrypted with AES-256-GCM before it leaves the Worker. The real filename and MIME
   type are encrypted too. The password is never stored, so a lost password means a lost file.
3. Files **expire** automatically (default 1 hour; `0` = never). Expired files return `404` immediately and are
   physically purged in the background after uploads (plus an optional cron trigger).
4. Only the **owner** (anonymous cookie), an **admin**, or the holder of the **delete token** can delete a file.

## Features

- One-page web UI (warm paper, serif headlines, light and dark): drag-and-drop or text upload, expiry chips, password toggle, upload progress, share link with copy button, your files with one-click actions, copy-paste snippets for cURL and MCP
- Optional password: AES-256-GCM content + filename encryption, key wrapped with PBKDF2-SHA256
- Per-upload expiration, short URLs, REST API with CORS
- Admin panel: view all files, upload limits, extension whitelist, password change
- MCP server at `/mcp` for AI agents: public tools (upload, read, inspect, delete) plus admin tools (list every file, change limits, purge) with an MCP token
- No servers to run: Workers + D1 + Supabase Storage, free-tier friendly for small usage

## Deploy to Cloudflare

Prerequisites: a Cloudflare account, a Supabase project, Node.js 20+.

```bash
npm install
npx wrangler login

# 1. Supabase: create the private bucket (SQL editor, or `supabase db push`)
#    -> run supabase-storage.sql from this repo once

# 2. Cloudflare: database
npx wrangler d1 create tete            # copy the printed database_id into wrangler.toml

# 3. Secrets
npx wrangler secret put SESSION_SECRET          # 32+ random characters
npx wrangler secret put ADMIN_PASSWORD          # initial admin password
npx wrangler secret put SUPABASE_SERVICE_KEY    # Supabase Settings -> API -> service_role key
npx wrangler secret put MCP_TOKEN               # optional: enables the admin MCP tools (e.g. openssl rand -hex 24)
# set SUPABASE_URL in wrangler.toml [vars]

# 4. Schema + deploy
npm run migrate:remote
npm run deploy
```

Custom domains: attach `tete.apipedia.id` (frontend) and `tetein.apipedia.id` (API) to this Worker, either in the
Cloudflare dashboard (*Workers & Pages → tete → Settings → Domains & Routes*) or by uncommenting `routes` in `wrangler.toml`. Full guide: [docs/18_INSTALLATION.md](docs/18_INSTALLATION.md).

> **Plan note:** password-locked uploads and admin login run PBKDF2 (100,000 iterations), which can exceed the
> 10 ms CPU limit of the Workers **Free** plan. Use the **Paid** plan for these features, or lower
> `PBKDF2_ITERATIONS` in `wrangler.toml` (weaker key derivation).

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars     # local SESSION_SECRET / ADMIN_PASSWORD
npm run migrate:local
npm run dev                         # http://localhost:8787 (local D1 emulation; point SUPABASE_URL at the fake in test/ or a real project)
# terminal 1: node test/fake-supabase.mjs   (stand-in for Supabase Storage)
npm run test:smoke                  # 50+ end-to-end checks, in another terminal
```

`npm run test:smoke` also works against production: `BASE_URL=https://tete.apipedia.id ADMIN_PASSWORD=... npm run test:smoke`.

## Usage

### Web UI
Open the site, drop files (or switch to text), optionally set a password and expiration, and upload. The **Files** tab
lists your uploads; **Docs** shows these documents. Admin: use the login button and the password from `ADMIN_PASSWORD`.

### API (curl)

```bash
curl -F "file=@myfile.txt" https://tetein.apipedia.id/api                       # upload
curl -F "file=@secret.txt" -F "password=s3cret" https://tetein.apipedia.id/api   # locked upload
curl -H "Content-Type: application/json" -d '{"text":"hello","filename":"a.txt"}' https://tetein.apipedia.id/api/text
curl -OJ https://tetein.apipedia.id/file/a1b2c3/download                         # download
curl -OJ -H "X-Password: s3cret" https://tetein.apipedia.id/file/a1b2c3/download # locked download
curl -X DELETE "https://tetein.apipedia.id/file/a1b2c3?token=<deleteToken>"      # delete
```

Complete reference: [api.md](api.md) (also served at `/api.md`). AI agents: [AGENT.md](AGENT.md).

### MCP

`POST https://tetein.apipedia.id/mcp` speaks MCP (Streamable HTTP, stateless). Tools: `upload_text`, `upload_base64`, `file_info`, `read_text`, `delete_file`. Add it to Claude Code as a remote HTTP server:

```bash
claude mcp add --transport http tete https://tetein.apipedia.id/mcp
# with admin tools (list all files, limits, purge, delete any file):
claude mcp add --transport http tete https://tetein.apipedia.id/mcp --header "Authorization: Bearer <MCP_TOKEN>"
```

Claude Desktop (via `mcp-remote`) and the exact tool list are on the site under *API & MCP* and in [api.md](api.md). Static
Bearer headers work in Claude Code and `mcp-remote`; the claude.ai connector UI expects OAuth and is not supported.

## Configuration

Defaults live in `wrangler.toml` `[vars]`; the admin **Config** tab overrides the first four at runtime (stored in D1).

| Variable | Default | Meaning |
|----------|---------|---------|
| `DEFAULT_EXPIRATION_MS` | `3600000` (1 h) | Expiration when none is given (`0` = never) |
| `MAX_FILE_SIZE_BYTES` | `26214400` (25 MB) | Per-file limit (hard cap 50 MB) |
| `MAX_FILES_PER_UPLOAD` | `10` | Files per request |
| `FILE_WHITELIST` | empty | Comma-separated extensions; empty allows all |
| `PBKDF2_ITERATIONS` | `100000` | Key-derivation cost for locked files and the admin password |
| `SESSION_SECRET` (secret) | – | Signs the admin cookie. Required for admin login |
| `ADMIN_PASSWORD` (secret) | – | Initial admin password; replaced once changed in the UI |
| `FRONTEND_HOST` / `API_HOST` | `tete.apipedia.id` / `tetein.apipedia.id` | Hostnames used when building links (other hosts such as workers.dev use their own origin) |
| `SUPABASE_URL` | – | Supabase project URL (not shown to users) |
| `SUPABASE_SERVICE_KEY` (secret) | – | `service_role` key; only the Worker holds it |
| `MCP_TOKEN` (secret) | – | Optional. A Bearer token that unlocks the admin MCP tools. Treat it like the admin password |

See [docs/16_CONFIG_REFERENCE.md](docs/16_CONFIG_REFERENCE.md).

## Limits and security notes

- **Size:** a Worker has 128 MB of memory and buffers uploads, so the practical ceiling is about 50 MB per file
  (default 25 MB). Larger files need direct-to-storage uploads (not implemented).
- **Unlocked files are public to anyone who knows the 6-hex ID.** Use a password for anything sensitive.
- **No rate limiting yet** on password attempts; PBKDF2 slows guessing but add a Cloudflare WAF rate-limit rule for
  public deployments.
- **Admin sessions are stateless** (signed cookie, 24 h). Logout clears the cookie; rotating `SESSION_SECRET`
  invalidates every session.
- Locked-file encryption protects data at rest in Supabase Storage and D1. The Worker briefly handles plaintext and the password
  while uploading and downloading, as with any server-side encryption.

Full list: [docs/10_RISK_REGISTER.md](docs/10_RISK_REGISTER.md).

## Project layout

```
worker/        Worker source (routing, files, admin, auth, crypto, config)
client/        Static web UI served by the Worker
migrations/    D1 schema
test/          End-to-end smoke test
docs/          Numbered project documentation
wrangler.toml  Bindings, assets, cron, default variables
```

## Documentation

[docs/](docs/) holds the numbered project documents: charter, PRD, TRD, architecture, config reference, installation,
database, risks, decisions, checklist and changelog.

## License

ISC · Repository: https://github.com/Cloud-Dark/tete
