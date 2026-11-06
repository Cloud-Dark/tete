# Product Requirements Document (PRD)

> Status: Final
> Last updated: 2026-11-06
> Owner: Cloud-Dark

## Problem

Sending a file to someone quickly usually means signing in to a service, installing an app, or leaving the file online
forever. Developers also want a `curl`-friendly endpoint they control.

## Target users

- People who need to hand over a file or snippet once, without an account.
- Developers and scripts that automate uploads (backups, CI artifacts, logs).
- Operators who want to self-host on Cloudflare with minimal upkeep.

## Features (MoSCoW)

| ID | Feature | Priority |
|----|---------|----------|
| F-01 | Upload files (drag and drop, multi-file) and text | Must |
| F-02 | Short link per upload, download and info endpoints | Must |
| F-03 | Automatic expiry, configurable per upload and by default | Must |
| F-04 | Password lock with encryption of content and filename | Must |
| F-05 | Delete with owner cookie, admin session, or one-time delete token | Must |
| F-06 | Personal file list; admin sees all files | Should |
| F-07 | Admin config: size limit, files per upload, extension whitelist, password change | Should |
| F-08 | Built-in docs viewer, `/README.md`, `/api.md`, `/AGENT.md` | Should |
| F-09 | Direct-to-storage large uploads | Could |
| F-11 | MCP server (`/mcp`) so AI agents can upload, read, inspect and delete | Should |
| F-10 | Rate limiting of password attempts | Could |

## User stories

- As a sender, I upload a file and receive a link that stops working after the expiry I chose.
- As a sender, I add a password so that even the operator cannot read the file or its name.
- As a script author, I upload with `curl` and keep the delete token to remove the file later.
- As an admin, I limit file size and allowed extensions without redeploying.

## Metrics

_TBD_ — no analytics are collected. Operational signals come from Workers observability (enabled in `wrangler.toml`).

Behaviour is specified in [04_TRD.md](04_TRD.md) and [api.md](../api.md).
