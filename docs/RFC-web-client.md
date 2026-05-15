# RFC — `apps/web`: a Next.js API over `mod-azor-api`

**Status:** accepted, scaffolded 2026-05-14.

## Goal

Give browser clients a way to reach AzerothCore data. The Discord bot is a
trusted server that can hold SOAP admin credentials; a browser cannot. So
`apps/web` is a **Next.js App Router API** that sits at that boundary: it holds
the SOAP creds, calls `mod-azor-api` through the shared client, and re-serves
the result as a plain JSON HTTP API the browser can call.

This makes the website "one of N API consumers" per the PLAN vision —
`source_type: 'website'` and `link_source: 'website'` are already reserved in
`@azor/shared`.

## Decisions

1. **Next.js API, not a browser SDK.** `mod-azor-api` only speaks SOAP, and
   SOAP needs `SEC_ADMINISTRATOR` creds — that can't ship to the browser. The
   route handlers run server-side (`runtime = 'nodejs'`); the browser talks to
   our routes, our routes talk to the module.
2. **Shared client, not a copy.** The transport-agnostic `mod-azor-api` client
   was extracted from the bot into `@azor/shared/client`
   (`createAzorApiClient(transport)` + `createHttpSoapTransport(config)`). The
   bot and the web API now share one implementation; each supplies its own
   transport built from its own env. The bot's `azorApiClient.ts` is now a thin
   edge wrapper.
3. **Read-only v1.** Only the Stage 2 read endpoints are exposed. `link begin` /
   `character interact` are deferred — writes need an authenticated caller
   identity and (for gifting) a policy layer like the bot's `giftPolicy.ts`.
4. **`fetch` transport.** `createHttpSoapTransport` uses the global `fetch`
   (Bun, Node 18+, Next's Node runtime all have it) instead of the bot's old
   `node:http` block — one implementation that works for both consumers.

## What landed

```
packages/shared/src/client/      — new: the shared mod-azor-api client
  quoting.ts                       quoteForChat, escapeXml
  soap.ts                          buildSoapEnvelope, parseSoapEnvelope, createHttpSoapTransport
  azorApiClient.ts                 createAzorApiClient(transport) + arg types
  index.ts                         barrel (exported as @azor/shared/client)

apps/discord-bot/src/lib/azorApiClient.ts   — now a thin wrapper over the shared client

apps/web/                        — new Next.js workspace (@azor/web)
  src/lib/{env,azorApi,respond}.ts
  src/app/api/.../route.ts         version, realm/{population,online}, character/[name]/{,location,status}
```

`@azor/shared` gained a `./client` subpath export; `@azor/shared` (the contract
types) is unchanged.

## Open decisions

- **Auth on the routes.** None yet — any caller who reaches the server can call
  every endpoint. Pick the gate (public read-only? API key? session?) before
  exposing publicly.
- **Schema-version guard.** Callers should compare `/api/version`'s `schema`
  against `AZOR_API_SCHEMA`; not yet enforced server-side.
- **Bad query params → 500.** `respond.handle` catches the client's argument
  throws as a generic 500; tighten to 400 with explicit validation.
- **Where the client ultimately lives.** It's in `@azor/shared/client` now. If a
  third consumer or external publishing appears, consider promoting it to its
  own `packages/azor-client`.

## Out of scope

- Browser-side or public, un-proxied API calls — that's `mod-azor-api`'s
  Stage 7 (HTTP transport + per-source tokens).
- Gifting / linking from the web (needs auth + a policy layer).
- Any direct `acore_*` access — forbidden by the architecture rule.

## Follow-ups

- `bun install` from the repo root — `next` / `react` / `@types/*` are new and
  not yet in `bun.lock`.
- `bun run typecheck` — `packages/shared` and `apps/discord-bot` were verified
  with the workspace `tsc`; `apps/web` needs `bun install` first (it can't
  resolve `next` until then).
- Smoke-test the routes against a live worldserver SOAP endpoint.
