# Master Checklist

> Status: Review
> Last updated: 2026-11-06
> Owner: Cloud-Dark

## Phase 1 — Cloudflare Workers migration (2026-11-06)

- [x] Worker entry, routing, error mapping, CORS (`worker/index.js`, `worker/http.js`)
- [x] R2 storage for file content, D1 schema for metadata and config (`migrations/0001_init.sql`)
- [x] Upload: multipart (`/api`, `/api/upload`) and text (`/api/text`)
- [x] Info, verify, download, delete, list
- [x] AES-256-GCM locked files with PBKDF2 key wrapping; encrypted filename and MIME type
- [x] Expiry: read-time rejection and 5-minute cron purge (verified locally)
- [x] Admin: login/logout/status, password change, runtime config, extension whitelist
- [x] Owner cookie and delete token authorisation
- [x] Client rewired to real same-origin endpoints; removed non-existent `/api/session`, `/api/storage`
- [x] Removed Express server, `db/` JSON files, `_redirects`, PM2/Nginx instructions
- [x] `wrangler deploy --dry-run` bundles successfully
- [x] Smoke test: 41/41 checks pass on `wrangler dev` ([uat](uat/2026-11-06_api-test-output.txt))
- [x] README, AGENT.md, api.md rewritten; numbered docs created

## Phase 2 — First production deployment (blocked: R2 is not enabled on the Cloudflare account)

- [x] D1/CPU optimisation pass (indexes, narrow selects, config cache, cron 30 min)
- [ ] Enable R2 in the Cloudflare dashboard (both accounts currently answer error 10042)
- [ ] Create R2 bucket `tete-files` and D1 database `tete` in the target account
- [ ] Put the real `database_id` in `wrangler.toml`
- [ ] Set `SESSION_SECRET` and `ADMIN_PASSWORD` secrets
- [ ] `npm run migrate:remote` and `npm run deploy`
- [ ] Run `npm run test:smoke` against the deployed URL
- [ ] Attach `tete.apipedia.id` and `tetein.apipedia.id` (uncomment `routes`)
- [ ] Confirm the Workers plan covers PBKDF2 CPU cost (R-02)
- [ ] Confirm the cron trigger runs in the dashboard

## Phase 3 — Hardening (backlog)

- [ ] WAF rate-limit rules for `/api/admin/login`, `/file/*/download`, `/file/*/verify` (R-04)
- [ ] Evaluate longer file ids (R-03)
- [ ] Direct-to-R2 uploads for files above 50 MB (R-01)
- [ ] Fix mojibake emoji in `client/js/app.js` (file was saved with a wrong encoding)
- [ ] Automated tests in CI (`wrangler dev` + `npm run test:smoke`)
