# CLAUDE.md — @azor/web

Next.js (App Router) API surface for the AZOR platform. It exposes a small,
browser-facing HTTP API; behind it, each route calls `mod-azor-api` through the
shared SOAP client. The browser talks to *these* routes — never to the module,
never to MySQL.

> Part of the AZOR monorepo (`/CLAUDE.md` at the repo root). This file documents
> the web package only. The `mod-azor-api` client lives in `@azor/shared/client`;
> the AzerothCore C++ module lives in `packages/server-module`.

## Why this exists

The Discord bot is a trusted server that can hold SOAP admin credentials. A
browser cannot. `apps/web` is the **server-side boundary** that lets browser
clients reach AzerothCore data: it holds the SOAP creds, calls the module, and
re-serves the result as a plain JSON HTTP API.

## Architecture

```
src/
  app/
    layout.tsx              — required App Router root layout (no real UI yet)
    page.tsx                — placeholder index
    api/
      version/route.ts                      — GET /api/version
      realm/population/route.ts             — GET /api/realm/population
      realm/online/route.ts                 — GET /api/realm/online?limit=&offset=
      character/[name]/route.ts             — GET /api/character/:name
      character/[name]/location/route.ts    — GET /api/character/:name/location
      character/[name]/status/route.ts      — GET /api/character/:name/status
  lib/
    azorApi.ts              — server-only: builds the shared client from env (memoised)
    env.ts                  — lazy reader for the SOAP_* env vars
    respond.ts              — AzorApiEnvelope → Response (status mapping + throw guard)
```

**Data flow:** browser → route handler → `azorApi()` (shared client +
HTTP SOAP transport) → `mod-azor-api` → JSON envelope → `respond()` → browser.

Every route is `runtime = 'nodejs'` + `dynamic = 'force-dynamic'`: the SOAP
transport needs Node, and every response reflects live worldserver state, so
nothing is statically cached.

## Stack

- **Framework:** Next.js (latest), App Router, `src/` directory
- **Runtime:** Bun for install/scripts; Node.js runtime for the route handlers
- **Language:** TypeScript 6, strict, extends `../../tsconfig.base.json`
  (overridden to `module: esnext` / `moduleResolution: bundler` for Next)
- **API client:** `@azor/shared/client` — the same client the Discord bot uses

## Environment Variables

Server-only — never prefix with `NEXT_PUBLIC_`. Read lazily in `lib/env.ts`, so
a missing var fails the first request rather than the build.

| Variable | Description |
|---|---|
| `SOAP_ENDPOINT` | AzerothCore SOAP host (the only AC transport) |
| `SOAP_PORT` | AzerothCore SOAP port (default AC: 7878) |
| `SOAP_USER` | SOAP admin username (needs `SEC_ADMINISTRATOR`) |
| `SOAP_PASSWORD` | SOAP admin password |

## Commands

```bash
# from repo root
bun install              # install workspace deps (hoisted) — required before first run
bun run web              # dev: next dev
bun run web:build        # prod: next build

# from apps/web/
bun run dev | build | start | typecheck
```

> `next` / `react` are workspace-local deps. `bun install` from the repo root is
> required before `typecheck` or `dev` will resolve them.

## Adding a route

1. Create `src/app/api/<path>/route.ts`.
2. `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'`.
3. Implement `GET` (etc.) as `return handle(() => azorApi().<method>(...))`.
4. If the module needs a new command, add it to `@azor/shared/client` first
   (and the contract types in `@azor/shared`), then both consumers.

## Scope & known gaps

- **Read-only v1.** Only the Stage 2 read endpoints are exposed. `link begin` /
  `character interact` are intentionally omitted — writes need an
  authenticated caller identity and (for gifting) a policy layer like the
  bot's `giftPolicy.ts`.
- **No auth on the routes yet.** Any caller who can reach the server can call
  these endpoints. Decide the gate (public read-only? API key? session?) before
  exposing this publicly.
- **No schema-version guard.** Callers should compare `/api/version`'s `schema`
  against `AZOR_API_SCHEMA` from `@azor/shared`; not yet enforced server-side.
- **Bad query params return 500, not 400.** `respond.handle` catches the shared
  client's argument throws as a generic 500; tighten with explicit validation.
- The proper browser-safe transport is `mod-azor-api`'s Stage 7 HTTP + per-source
  tokens (see `docs/PLAN.md`); until then this app *is* the trusted boundary.
