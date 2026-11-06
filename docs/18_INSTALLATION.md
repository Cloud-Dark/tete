# Installation and Deployment

> Status: Final
> Last updated: 2026-11-06
> Owner: Cloud-Dark

## Prerequisites

- Cloudflare account (Workers **Paid** plan recommended: see [10_RISK_REGISTER.md](10_RISK_REGISTER.md) R-02)
- Supabase project (Pro recommended: see R-11). Only Storage is used
- Node.js 20+ and npm

## First deployment

```bash
npm install
npx wrangler login
```

1. **Create the Supabase bucket.** In the Supabase SQL editor run [`supabase-storage.sql`](../supabase-storage.sql). It
   creates the private bucket `tete` (50 MB per object). Then read the project URL and the `service_role` key from
   *Settings → API*.

2. **Create the database and set secrets**

   ```bash
   npx wrangler d1 create tete
   ```

   Copy the printed `database_id` into `[[d1_databases]]` and set `SUPABASE_URL` in `[vars]` of `wrangler.toml`.

   ```bash
   npx wrangler secret put SESSION_SECRET        # e.g. output of: openssl rand -hex 32
   npx wrangler secret put ADMIN_PASSWORD
   npx wrangler secret put SUPABASE_SERVICE_KEY  # the service_role key
   ```

3. **Apply the schema and deploy**

   ```bash
   npm run migrate:remote
   npm run deploy
   ```

4. **Verify the deployment**

   ```bash
   BASE_URL=https://tete.<your-subdomain>.workers.dev ADMIN_PASSWORD='<the password>' npm run test:smoke
   ```

   All checks must pass. The smoke test creates and deletes its own files.

## Custom domains

In `wrangler.toml` uncomment `routes`; both hostnames can serve the same Worker (UI on `tete.apipedia.id`, API on
`tetein.apipedia.id`). The zone must be in the same Cloudflare account. Then run `npm run deploy` again.

## Local development

```bash
cp .dev.vars.example .dev.vars
npm run migrate:local
npm run dev            # http://localhost:8787
npm run test:smoke     # second terminal
```

Local D1 is emulated under `.wrangler/state` (git-ignored). Start the Supabase Storage stand-in first with `node test/fake-supabase.mjs`; `.dev.vars.example` already points at it. To test the cron purge locally:

```bash
curl -X POST "http://localhost:8787/cdn-cgi/local/explorer/api/local/scheduled?worker=tete" \
  -H 'Content-Type: application/json' -d '{"cron":"*/30 * * * *"}'
```

## Updating

- Code or UI changes: `npm run deploy`.
- Schema changes: add `migrations/000N_*.sql`, then `npm run migrate:remote` before deploying. Never edit an applied migration.
- Config values: admin Config tab, or edit `[vars]` and redeploy.

## Migrating from the Express version

There is no data migration: old uploads were temporary and live on the old server's disk. Cut over by pointing the
domains at the Worker. Note that `tete.apipedia.id` and `tetein.apipedia.id` are currently attached to other projects (a Pages project and the Worker `tete-proxy`); detach them before adding `routes`. Do **not** reuse the old admin password; its hash was committed to git history
([10_RISK_REGISTER.md](10_RISK_REGISTER.md) R-06). Remove the old PM2/Nginx setup.

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `Admin is not configured` (503) | `SESSION_SECRET` secret missing or shorter than 16 characters |
| Admin login always `401` | Wrong `ADMIN_PASSWORD`, or a different password was set in the UI (D1 wins) |
| Locked upload/download fails with `500` or "exceeded CPU" | Free plan CPU limit: use the Paid plan or lower `PBKDF2_ITERATIONS` |
| Upload `413` | File over the limit; see [16_CONFIG_REFERENCE.md](16_CONFIG_REFERENCE.md) |
| `no such table: files` | Migrations not applied: `npm run migrate:remote` (or `migrate:local`) |
| `Storage is not configured` (503) | `SUPABASE_URL` empty or `SUPABASE_SERVICE_KEY` secret missing |
| Uploads/downloads fail with `500` | Check Worker logs for `Supabase Storage ... failed: <status>`: `401` wrong key, `404` bucket `tete` missing, project paused (R-11) |
| Files never disappear from Storage | Check the cron trigger in the Cloudflare dashboard and Worker logs |
