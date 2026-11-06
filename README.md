# TETE - Transient Endpoint for Transfer & Encryption

> Temporary file sharing with optional password encryption. Runs entirely on **Cloudflare Workers** (R2 + D1).

<img width="1763" height="1674" alt="image" src="https://github.com/user-attachments/assets/20085d0c-f2b8-4351-b5d7-f3b75ac2d266" />

| Service | URL |
|---------|-----|
| Web UI | `https://tete.apipedia.id` |
| API | `https://tetein.apipedia.id` (same Worker, same API) |

---

## How it works

One Worker does everything. There is no server to run.

```
Browser / curl ──► Cloudflare Worker (worker/index.js)
                     ├─ web UI         ◄── static assets  (client/)
                     ├─ file content   ◄─► R2  bucket   (key = file id)
                     ├─ metadata       ◄─► D1  database (files, config)
                     └─ cron every 5 min ──► delete expired files
```

1. **Upload** a file or text (UI or `curl`). You get a 6-character ID, a link, and a one-time **delete token**.
2. With a **password**, the content is encrypted with AES-256-GCM before it reaches R2. The real filename and MIME
   type are encrypted too. The password is never stored, so a lost password means a lost file.
3. Files **expire** automatically (default 1 hour; `0` = never). Expired files return `404` immediately and are
   physically purged by a cron trigger.
4. Only the **owner** (anonymous cookie), an **admin**, or the holder of the **delete token** can delete a file.

## Features

- Drag-and-drop UI, multi-file upload, text snippets
- Optional password: AES-256-GCM content + filename encryption, key wrapped with PBKDF2-SHA256
- Per-upload expiration, short URLs, REST API with CORS
- Admin panel: view all files, upload limits, extension whitelist, password change
- Zero servers: Workers + R2 + D1, free-tier friendly for small usage

## Deploy to Cloudflare

Prerequisites: a Cloudflare account, Node.js 20+.

```bash
npm install
npx wrangler login

# 1. Storage
npx wrangler r2 bucket create tete-files
npx wrangler d1 create tete            # copy the printed database_id into wrangler.toml

# 2. Secrets
npx wrangler secret put SESSION_SECRET   # 32+ random characters
npx wrangler secret put ADMIN_PASSWORD   # initial admin password

# 3. Schema + deploy
npm run migrate:remote
npm run deploy
```

Custom domains: uncomment `routes` in `wrangler.toml` (both `tete.apipedia.id` and `tetein.apipedia.id` can point to
this same Worker), then deploy again. Full guide: [docs/18_INSTALLATION.md](docs/18_INSTALLATION.md).

> **Plan note:** password-locked uploads and admin login run PBKDF2 (100,000 iterations), which can exceed the
> 10 ms CPU limit of the Workers **Free** plan. Use the **Paid** plan for these features, or lower
> `PBKDF2_ITERATIONS` in `wrangler.toml` (weaker key derivation).

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars     # local SESSION_SECRET / ADMIN_PASSWORD
npm run migrate:local
npm run dev                         # http://localhost:8787 (local R2 + D1 emulation)
npm run test:smoke                  # 40+ end-to-end checks
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

See [docs/16_CONFIG_REFERENCE.md](docs/16_CONFIG_REFERENCE.md).

## Limits and security notes

- **Size:** a Worker has 128 MB of memory and buffers uploads, so the practical ceiling is about 50 MB per file
  (default 25 MB). Larger files need direct-to-R2 uploads (not implemented).
- **Unlocked files are public to anyone who knows the 6-hex ID.** Use a password for anything sensitive.
- **No rate limiting yet** on password attempts; PBKDF2 slows guessing but add a Cloudflare WAF rate-limit rule for
  public deployments.
- **Admin sessions are stateless** (signed cookie, 24 h). Logout clears the cookie; rotating `SESSION_SECRET`
  invalidates every session.
- Locked-file encryption protects data at rest in R2 and D1. The Worker briefly handles plaintext and the password
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
