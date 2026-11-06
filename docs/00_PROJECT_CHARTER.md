# Project Charter

> Status: Final
> Last updated: 2026-11-06
> Owner: Cloud-Dark

## Vision

A tiny, self-contained temporary file-sharing service that anyone can deploy to their own Cloudflare account in minutes,
with no servers to operate.

## Goals

1. Share a file or text snippet through a short link, with automatic expiry.
2. Optional password protection backed by real encryption (content and filename).
3. Run **entirely on Cloudflare Workers** (Worker + R2 + D1), including the web UI.
4. One origin for UI and API; scriptable with `curl`.

## Scope

| In scope | Out of scope |
|----------|--------------|
| File and text upload, download, delete, list | User accounts and sign-up |
| Per-upload expiration and automatic purge | Resumable / multi-GB uploads (see [11_DECISIONS.md](11_DECISIONS.md) D-004) |
| Password-based encryption at rest | End-to-end (client-side) encryption |
| Admin panel: limits, whitelist, password | Billing, quotas per user |
| Smoke test usable against production | Virus scanning |

## Stakeholders

| Role | Who |
|------|-----|
| Owner / maintainer | Cloud-Dark |
| Operators | Anyone deploying their own instance |
| Users | Anonymous people and scripts sharing files |
| Production instance | `tete.apipedia.id` (UI), `tetein.apipedia.id` (API) |

## Success criteria

- `wrangler deploy` is the only deployment step after one-time resource creation ([18_INSTALLATION.md](18_INSTALLATION.md)).
- `npm run test:smoke` passes locally and against the deployed Worker.
- No Node.js server, local disk, or in-memory state is required at runtime.
- Documentation matches the behaviour of the code ([31_CHANGELOG.md](31_CHANGELOG.md)).
