# Master Checklist

> Status: Review
> Last updated: 2026-11-06
> Owner: Cloud-Dark

## Phase 1 — Cloudflare Workers migration (2026-11-06)

- [x] Worker entry, routing, error mapping, CORS (`worker/index.js`, `worker/http.js`)
- [x] Supabase Storage client for file content (`worker/storage.js`), D1 schema for metadata and config (`migrations/0001_init.sql`)
- [x] MCP server at `/mcp` (`worker/mcp.js`)
- [x] Upload: multipart (`/api`, `/api/upload`) and text (`/api/text`)
- [x] Info, verify, download, delete, list
- [x] AES-256-GCM locked files with PBKDF2 key wrapping; encrypted filename and MIME type
- [x] Expiry: read-time rejection and 5-minute cron purge (verified locally)
- [x] Admin: login/logout/status, password change, runtime config, extension whitelist
- [x] Owner cookie and delete token authorisation
- [x] Client rewired to real same-origin endpoints; removed non-existent `/api/session`, `/api/storage`
- [x] Removed Express server, `db/` JSON files, `_redirects`, PM2/Nginx instructions
- [x] `wrangler deploy --dry-run` bundles successfully
- [x] Smoke test: 53/53 checks pass on `wrangler dev` with the Supabase Storage stand-in ([uat](uat/2026-11-06_api-test-output.txt))
- [x] Same smoke test against the real Supabase project and the deployed Worker: 53/53 ([live run](uat/2026-11-06_live-api-test-output.txt))
- [x] README, AGENT.md, api.md rewritten; numbered docs created

## Phase 2 — First production deployment (pending Supabase credentials)

- [x] D1/CPU optimisation pass (indexes, narrow selects, config cache, cron 30 min)
- [x] `supabase-storage.sql` applied (bucket `tete` exists, private)
- [x] D1 database `tete` created (id in `wrangler.toml`) and migrated remotely
- [ ] Put the real `database_id` in `wrangler.toml`
- [x] `SESSION_SECRET` and `ADMIN_PASSWORD` secrets set
- [x] `SUPABASE_SERVICE_KEY` secret set; `SUPABASE_URL` confirmed (project `kheniasmdqflwawtopip`, bucket `tete` private, 50 MB)
- [ ] Rotate the Supabase secret key and the Cloudflare API token (both were pasted into a chat)
- [x] `npm run migrate:remote` and `npm run deploy` to `https://tete.apipedia.workers.dev` (2026-11-06)
- [ ] Run `npm run test:smoke` against the deployed URL
- [ ] Attach `tete.apipedia.id` and `tetein.apipedia.id` (uncomment `routes`)
- [ ] Confirm the Workers plan covers PBKDF2 CPU cost (R-02)
- [ ] Cron trigger: not registered (Free plan, 5-slot limit); background purge is the fallback (R-15)

## Phase 3 — Hardening (backlog)

- [ ] WAF rate-limit rules for `/api/admin/login`, `/file/*/download`, `/file/*/verify` (R-04)
- [ ] Evaluate longer file ids (R-03)
- [ ] Direct-to-storage uploads for files above 50 MB (R-01)
- [ ] Fix mojibake emoji in `client/js/app.js` (file was saved with a wrong encoding)
- [ ] Automated tests in CI (`wrangler dev` + `npm run test:smoke`)
