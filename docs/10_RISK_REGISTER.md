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
| R-11 | Supabase Free projects are paused after about a week of inactivity, which would make every upload and download fail | Medium | High | Use a Pro project, or keep it active; the Worker answers `503`/`500` clearly and rolls back D1 rows. _Pause policy to be verified on supabase.com_ | Operator |
| R-12 | Every transfer makes an extra hop to Supabase, adding latency and a second vendor to monitor | Certain | Low | Accepted ([11_DECISIONS.md](11_DECISIONS.md) D-010); keep the Supabase region close to the Worker's users | Operator |
| R-13 | The Supabase `service_role` key grants full access to the project; a leak exposes every stored (encrypted or not) file | Low | High | Held only as a Worker secret; use a dedicated project for TETE; rotate in Supabase and `wrangler secret put` if leaked | Operator |
| R-14 | `/mcp` is public like the REST API: anyone can upload through it, with the same limits | Medium | Low | Same size/extension limits as the API; add WAF rate limits (R-04) | Operator |
