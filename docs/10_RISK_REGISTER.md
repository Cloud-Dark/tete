# Risk Register

> Status: Final
> Last updated: 2026-11-06
> Owner: Cloud-Dark

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
|----|------|-----------|--------|------------|-------|
| R-01 | Worker memory (128 MB) is exhausted by large buffered uploads | Medium | High (request fails) | Default 25 MB / hard cap 50 MB per file, 60 MB per request; direct-to-R2 uploads are a future item | Cloud-Dark |
| R-02 | PBKDF2 (100k iterations) exceeds the Free plan's 10 ms CPU limit, so locked uploads and admin login fail | High on Free plan | Medium | Use the Paid plan, or lower `PBKDF2_ITERATIONS` (weaker). Documented in the README | Cloud-Dark |
| R-03 | 6-hex ids (16.7 M) can be enumerated; unlocked files are readable by anyone who finds the id | Medium | Medium | Lock sensitive files with a password; add a WAF rate-limit rule; consider longer ids | Cloud-Dark |
| R-04 | No rate limiting on password attempts or admin login | Medium | Medium | PBKDF2 cost slows guessing; add Cloudflare WAF rate-limiting rules for the Worker | Operator |
| R-05 | Stateless admin sessions cannot be revoked individually | Low | Low | 24 h expiry; rotate `SESSION_SECRET` to invalidate all sessions | Operator |
| R-06 | Previous Express version committed an admin password hash and session secret (`db/config.json`) to git history | Certain (already public in history) | Medium | Files removed; do not reuse the old admin password; the Worker uses new secrets | Cloud-Dark |
| R-07 | Data from the old Express deployment (disk files, `db/metadata.json`) is not migrated | Certain | Low (files were temporary) | Document as a clean cut-over; old links stop working | Cloud-Dark |
| R-08 | D1 and R2 writes are not atomic; a failed delete can leave an orphan R2 object or row | Low | Low | Upload rolls back its row on R2 failure; cron removes expired rows and objects; orphans only waste storage | Cloud-Dark |
| R-09 | `?password=` in download URLs can end up in logs/history | Medium | Medium | `X-Password` header is supported and documented; the web UI uses the header | Cloud-Dark |
| R-10 | Server-side encryption means the Worker sees plaintext and the password transiently | Certain (by design) | Medium | Documented; end-to-end client encryption is out of scope ([11_DECISIONS.md](11_DECISIONS.md)) | Cloud-Dark |
