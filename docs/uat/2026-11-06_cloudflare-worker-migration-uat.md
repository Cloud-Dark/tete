# UAT: Cloudflare Worker migration (Worker + D1 + Supabase Storage)

> Status: Final
> Last updated: 2026-11-06
> Owner: Cloud-Dark

- **Date:** 2026-11-06
- **Environment:** `wrangler dev` 4.158.0 (local D1 emulation, Node 22) with `test/fake-supabase.mjs` standing in for Supabase Storage. **Not yet run against a deployed Worker or a real Supabase project** ([07_MASTER_CHECKLIST.md](../07_MASTER_CHECKLIST.md) Phase 2).
- **Raw output:** [2026-11-06_api-test-output.txt](2026-11-06_api-test-output.txt) (53 PASS, 0 FAIL)

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
| 17 | Bundle | `wrangler deploy --dry-run` | Bundles with D1 and ASSETS bindings, `SUPABASE_URL` variable | As expected (80 KiB, 23 KiB gzip) | PASS |
| 18 | MCP | initialize, notification, tools/list, `upload_text` (locked), `read_text` right/wrong password, `upload_base64`, `file_info`, `delete_file` bad/good token, `GET /mcp`, unknown method | Negotiated version, 5 tools, links on the public origin, tool errors flagged `isError`, 405, -32601 | As expected | PASS |
| 19 | Cron purge removes Storage objects | 3 expiring uploads, trigger scheduled handler, count objects in the stand-in | Objects removed with their rows | 13 to 8 objects, log `Purged 5 expired file(s)` | PASS |
| 20 | Storage down | Stop the stand-in, upload | Error response, no orphan D1 row | `500`, row count 8 before and after | PASS |
| 22 | Purge without cron | `PURGE_INTERVAL_MS=1`, 3 expiring uploads, one more upload, count objects | Expired objects removed by the upload-triggered purge | 7 to 5 objects (net of the new upload) | PASS |
| 23 | Host split | Requests with `Host: tetein...` / `tete...` against local dev | Share url on frontend host, download/delete urls on API host, API root JSON vs UI, 302 for browsers on the API host | 8 checks pass (smoke test now 61 checks locally) | PASS |
| 21 | Storage not configured | Empty `SUPABASE_URL` / key, upload | Clear error, no orphan row | `503 Storage is not configured ...`, row count unchanged | PASS |

## Not covered

- **Real Supabase Storage.** The stand-in follows the documented REST behaviour (auth headers, POST/GET object, bulk delete by `prefixes`, 400/404 for a missing object) but the real service is untested, including the exact status it returns for a missing object and the `x-upsert` header semantics.
- Real Cloudflare deployment, custom domains, and Workers Free-plan CPU behaviour for PBKDF2 (R-02).
- Uploads above 5 MB are rejected by design, so the former 50 MB memory question no longer applies (R-01).
- Admin password change through the browser UI (the API flow is covered by scenario 16).

## Live run against the deployed Worker and real Supabase Storage

- **Target:** `https://tete.apipedia.workers.dev` (Cloudflare Workers Free plan) with Supabase project `kheniasmdqflwawtopip`, private bucket `tete`.
- **Raw output:** [2026-11-06_live-api-test-output.txt](2026-11-06_live-api-test-output.txt) (53 PASS, 0 FAIL)
- **Result:** every scenario above that is part of the smoke test passes against the real services, including locked-file encryption and decryption, MCP, delete authorisation, expiry, admin and size limits.
- **Real Supabase behaviour confirmed:** a missing object answers `400` (handled as "not found" by `worker/storage.js`); the `sb_secret_` key works in both the `apikey` and `Authorization: Bearer` headers; upload, streamed download and bulk delete work.
- **Finding:** the first live run failed one check. The admin whitelist reset was cached for up to 60 s in other isolates (per-isolate config cache, D-009), so an upload was still rejected for a moment. D1 held the correct value. The smoke test now waits until the change is visible; behaviour is documented in [20_DATABASE.md](../20_DATABASE.md).
- **Still not covered:** the cron trigger (not registered, R-15).

## Live run on the production domains

- **Targets:** `https://tetein.apipedia.id` (API host, with `FRONTEND_URL=https://tete.apipedia.id`) and `https://tete.apipedia.id` (frontend host).
- **Raw output:** [API host](2026-11-06_live-domains-api-host-output.txt) and [frontend host](2026-11-06_live-domains-frontend-host-output.txt): 53 PASS, 0 FAIL each.
- **Browser check (Chromium via Playwright):** `tete.apipedia.id` loads the Worker UI, a text upload returns `https://tete.apipedia.id/file/<id>`, the share page shows the file, the download saves the right content, and the Files tab lists it. Hosts contacted: `tete.apipedia.id`, Cloudflare Insights, Google Fonts. No requests to any Supabase host, no failed requests, no page errors.
- **Finding:** the first run against the API host failed 3 checks that assumed one host (`/` returning the UI, the share page rendering on the API host, links on the request origin). On the API host the root returns the API index, browsers are redirected (302) to the frontend, and `url` points at the frontend. The smoke test now takes `FRONTEND_URL`.
- **Earlier symptom explained:** before the move, `tete.apipedia.id` served the old Pages app, which called a deleted Supabase project (`ERR_NAME_NOT_RESOLVED`).

## Redesign, MCP admin tools and config fixes (final run)

- **Local:** 72 smoke checks (including 10 admin MCP checks and the atomic-config check) and a 29-step Chromium run of the new UI: upload (progress, expiry chips, password), result card, share page, public and locked download (wrong and right password), file list, hostile file name escaped, modal download, delete, theme toggle, back-to-top, snippets, admin login and limits, logout, mobile menu and no horizontal scroll at 390 px.
- **Live:** smoke test on `https://tetein.apipedia.id` and `https://tete.apipedia.id` with `MCP_TOKEN`: 64 PASS, 0 FAIL on each (outputs above); Chromium run on the live UI before the restyle: all steps passed.
- **Finding 1:** the live UI run failed once because the limits form was submitted before its values loaded, which also exposed that `POST /api/config` wrote fields one by one and stopped at the first invalid one. That had set the production default expiration to 30 minutes; it was restored to 1 hour through the admin API. Both causes are fixed and covered by a smoke check.
- **Finding 2:** the owner rejected the first redesign; the UI now follows the apipedia.id palette and type (see D-014).

## Real MCP client check (Claude Code 2.1.318, live)

- `claude mcp add --transport http ... https://tetein.apipedia.id/mcp` without a token: connected. With `--header "Authorization: Bearer <MCP_TOKEN>"`: connected, and a headless `claude -p` session called the admin tool `get_config` end to end and returned the live limits.
- **Observation:** `claude mcp list` reported "tools fetch failed, request timed out" in 2 of 4 attempts with the token. Server-side timing from curl: median 0.2 s, but about 1 request in 20 to 40 stalled for about 15 s, with and without the token. A control request to `https://www.cloudflare.com/cdn-cgi/trace` showed the same 15 s outliers, so the stalls come from the network path of the test sandbox rather than from the Worker. Not proven for other networks: if an MCP client shows intermittent timeouts, check `wrangler tail` for slow requests.

## OAuth for MCP

- **Local smoke:** 103 checks, including 31 OAuth checks: 401 with the discovery hint (POST and GET), both metadata documents, dynamic registration (https and loopback accepted; `javascript:` and remote `http` rejected), consent screen (client name escaped, framing denied), unregistered redirect and unknown client shown as error pages without redirecting, missing PKCE redirected as `invalid_request`, wrong password / deny / forged approval token, code + state + iss on approval, wrong verifier, redeem, code replay, redirect mismatch at the token endpoint, access token unlocks all nine tools, garbage Bearer 401, refresh, an access token or client id presented as an admin cookie is rejected, `/mcp/public` ignores credentials, sign-out of all clients (old access and refresh tokens rejected, admin session required).
- **Browser:** Chromium opened the consent screen in light and dark, a wrong password kept the screen with an error, Allow redirected to a real callback server (the CSP `form-action` allows the registered origin) and the code from that flow was redeemable.
- **Live (production domains):** smoke test on `https://tetein.apipedia.id` and `https://tete.apipedia.id`: 91 PASS, 0 FAIL on each, 27 of them OAuth (the 4 sign-out checks are skipped live because they would disconnect real clients; they run locally and with `OAUTH_REVOKE_TEST=1`). The browser consent flow passed against `https://tetein.apipedia.id`, and the website UI run passed again.
- **Real client:** Claude Code 2.1.318 reports `/mcp` as "Needs authentication" (it recognised the 401 and the OAuth discovery) and `/mcp/public` as connected. The interactive sign-in itself needs a person in a browser and was not completed in the sandbox; the same flow was exercised end to end with a scripted client and with Chromium.
- **Cleanup:** all tokens created by these tests were signed out afterwards (Admin → sign out all connected applications).

## 5 MB limit and Resources panel

- **Local:** 111 smoke checks (a file of exactly 5 MB is accepted and downloads intact, 5 MB + 1 byte, 26 MB and a text above 5 MB are rejected with `413`, the admin cannot raise the limit above 5 MB, `GET /api/usage` shape, aggregates only, remaining = quota - used), a dedicated quota test (`test/quota.mjs`, dev server with a 2 MB quota: second 1.2 MB upload gets `507 Storage is full`, the same upload fits again after a delete), the UI run (Resources panel shows 5 MB, storage left and files stored) and the consent flow.
- **Live:** the Supabase bucket limit was lowered from 50 MB to 5 MB through the Storage API (bucket stays private); smoke test on both production domains: 99 PASS, 0 FAIL each, including the real 5 MB upload to Supabase Storage; the UI run (with the Resources checks) and the consent flow passed on production.
- **Finding:** the first live run failed `whitelist rejects .exe` on both domains. After an admin saves a whitelist, other Worker instances keep the old value for up to 60 seconds (D-009), so the probe upload landed on an instance that had not caught up. The test now retries until the probe is rejected and deletes accidental successes.
- **Cleanup:** the stored `maxFileSize` override (25 MB, written by an earlier UI test run) was set to 5 MB. About 21 small files created by the test runs remain on production and expire on their own within the hour (default lifetime); a bulk delete was not performed.
