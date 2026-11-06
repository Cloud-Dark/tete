# Risk Register

> Status: Final
> Last updated: 2026-11-06
> Owner: Cloud-Dark

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
|----|------|-----------|--------|------------|-------|
| R-01 | Worker memory (128 MB) is exhausted by large buffered uploads | Medium | High (request fails) | Default 25 MB / hard cap 50 MB per file, 60 MB per request; direct-to-storage uploads are a future item | Cloud-Dark |
| R-02 | PBKDF2 (100k iterations) exceeds the Free plan's 10 ms CPU limit, so locked uploads and admin login fail | High on Free plan | Medium | Use the Paid plan, or lower `PBKDF2_ITERATIONS` (weaker). Documented in the README | Cloud-Dark |
| R-03 | 6-hex ids (16.7 M) can be enumerated; unlocked files are readable by anyone who finds the id | Medium | Medium | Lock sensitive files with a password; add a WAF rate-limit rule; consider longer ids | Cloud-Dark |
| R-04 | No rate limiting on password attempts or admin login | Medium | Medium | PBKDF2 cost slows guessing; add Cloudflare WAF rate-limiting rules for the Worker | Operator |
| R-05 | Stateless admin sessions cannot be revoked individually | Low | Low | 24 h expiry; rotate `SESSION_SECRET` to invalidate all sessions | Operator |
| R-06 | Previous Express version committed an admin password hash and session secret (`db/config.json`) to git history | Certain (already public in history) | Medium | Files removed; do not reuse the old admin password; the Worker uses new secrets | Cloud-Dark |
| R-07 | Data from the old Express deployment (disk files, `db/metadata.json`) is not migrated | Certain | Low (files were temporary) | Document as a clean cut-over; old links stop working | Cloud-Dark |
| R-08 | D1 and Supabase Storage writes are not atomic; a failed delete can leave an orphan object or row | Low | Low | Upload rolls back its row on Storage failure (verified); cron removes expired rows and objects; orphans only waste storage | Cloud-Dark |
| R-09 | `?password=` in download URLs can end up in logs/history | Medium | Medium | `X-Password` header is supported and documented; the web UI uses the header | Cloud-Dark |
| R-10 | Server-side encryption means the Worker sees plaintext and the password transiently | Certain (by design) | Medium | Documented; end-to-end client encryption is out of scope ([11_DECISIONS.md](11_DECISIONS.md)) | Cloud-Dark |
| R-15 | On the Workers Free plan the account's 5 cron slots were already used, so the purge cron is disabled; with no uploads, expired objects stay in Storage (still unreadable) until the next upload | Medium | Low | Background purge after uploads; enable the cron on a Paid plan or free a slot | Operator |
| R-11 | Supabase Free projects are paused after about a week of inactivity, which would make every upload and download fail | Medium | High | Use a Pro project, or keep it active; the Worker answers `503`/`500` clearly and rolls back D1 rows. _Pause policy to be verified on supabase.com_ | Operator |
| R-12 | Every transfer makes an extra hop to Supabase, adding latency and a second vendor to monitor | Certain | Low | Accepted ([11_DECISIONS.md](11_DECISIONS.md) D-010); keep the Supabase region close to the Worker's users | Operator |
| R-13 | The Supabase secret key grants full access to the project, and the project `kheniasmdqflwawtopip` also holds buckets of other applications (e.g. `payment-proofs`, `wasession`, `whatsapp-sessions`); the key was also shared in a chat; a leak exposes every stored (encrypted or not) file | Low | High | Held only as a Worker secret; strongly prefer a dedicated Supabase project for TETE; rotate the key in Supabase and run `wrangler secret put SUPABASE_SERVICE_KEY` (rotation is pending, see the checklist) | Operator |
| R-14 | `/mcp` is public like the REST API: anyone can upload through it, with the same limits | Medium | Low | Same size/extension limits as the API; add WAF rate limits (R-04) | Operator |
| R-16 | The `MCP_TOKEN` gives admin-level control of every file and of the limits through `/mcp`, and a static Bearer token can leak through client config files or shell history | Low | High | Separate from the admin password; rotate with `wrangler secret put MCP_TOKEN`; keep it out of repositories; prefer `mcp-remote` with the `env` form shown in the UI so it is not on a command line | Operator |
| R-17 | Dynamic client registration is open (required by the protocol), so any website can start an authorization request; the consent screen asks for the admin password but has no rate limit, and a phishing page could imitate an application name | Medium | High (admin-level MCP access if the admin approves a hostile client) | The consent screen shows the redirect host, requires the admin password every time, signed approval request, exact redirect URIs, 60 s single-use codes, 1 h access tokens; add Cloudflare rate limiting on `/oauth/authorize`; use *Sign out all connected applications* after doubt. Never approve a connection you did not start | Operator |
