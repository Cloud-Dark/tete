# UAT: Cloudflare Worker migration

> Status: Final
> Last updated: 2026-11-06
> Owner: Cloud-Dark

- **Date:** 2026-11-06
- **Environment:** `wrangler dev` 4.158.0 (local R2 + D1 emulation, Node 22). Not yet run against a deployed Worker ([07_MASTER_CHECKLIST.md](../07_MASTER_CHECKLIST.md) Phase 2).
- **Raw output:** [2026-11-06_api-test-output.txt](2026-11-06_api-test-output.txt) (41 PASS, 0 FAIL)

## Scenarios

| # | Scenario | Steps | Expected | Actual | Status |
|---|----------|-------|----------|--------|--------|
| 1 | Text upload and download | `POST /api/text`, `GET /file/:id/download` | Same text, attachment header | As expected | PASS |
| 2 | Binary multipart upload | `POST /api` with 70 KB blob | Byte-identical download | As expected | PASS |
| 3 | Multi-file upload | `POST /api/upload` with two files | Array of two results | As expected | PASS |
| 4 | Locked file | Upload with password; download none / wrong / right | 401 / 401 / plaintext with real name | As expected | PASS |
| 5 | Locked metadata hidden | Public info of locked file | `<id>.enc`, locked true | As expected | PASS |
| 6 | Password verify | `POST /file/:id/verify` wrong / right | 401 / 200 | As expected | PASS |
| 7 | Per-owner listing | Two cookie jars | Each sees only own files; admin sees all | As expected | PASS |
| 8 | Delete authorisation | Stranger; token; owner cookie | 403; 200; 200 | As expected | PASS |
| 9 | Expiry | `expiration=1000`, wait 1.5 s | 404 | As expected | PASS |
| 10 | Cron purge | Expired rows, trigger scheduled handler, count rows | Rows deleted, log `Purged 2 expired file(s)` | 2 rows to 0 (manual check, not in smoke test) | PASS |
| 11 | Limits and validation | Oversize 26 MB, no file, no text, bad id | 413 / 400 / 400 / 404 | As expected | PASS |
| 12 | Admin | Login wrong/right, status, config read/update, whitelist, logout | 401 / 200 / true / 200 / 400 on `.exe` / false | As expected | PASS |
| 13 | Browser vs API | `GET /file/:id` with `Sec-Fetch-Dest: document` vs `Accept: */*` | HTML page vs JSON | As expected | PASS |
| 14 | Docs and CORS | `/README.md`, `/api.md`, `OPTIONS /api` | 200, placeholders replaced, 204 with CORS | As expected | PASS |
| 15 | Web UI end to end (Playwright, Chromium) | Open `/`, upload text, open file page, download, Files tab, `/readme` | All render, file saved as `ui.txt`, no failed requests or page errors | As expected | PASS |
| 16 | Admin password change | Login, change to 3 chars, change to valid, login with old / new | 400; 200; 401 / 200 | As expected (manual curl, not in smoke test) | PASS |
| 17 | Bundle | `wrangler deploy --dry-run` | Bundles with D1, R2, ASSETS bindings | As expected | PASS |

## Not covered

- Real Cloudflare deployment, custom domains, and Workers Free-plan CPU behaviour for PBKDF2 (R-02).
- Uploads near the 50 MB cap under real Worker memory limits (R-01).
- Admin password change through the browser UI (the API flow is covered by scenario 16).
