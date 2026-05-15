# CLAUDE.md — AZOR monorepo

Bun-workspaces monorepo for the AZOR project. Three surfaces talk to the same AzerothCore world: a Discord bot (TypeScript), a Next.js API (TypeScript), and a server-side C++ module loaded by `acore-worldserver`. Shared types/helpers live in a fourth package so every side stays in lockstep.

## Layout

```
.
├── apps/
│   ├── discord-bot/        @azor/bot         — discord.js v14 bot (Bun runtime)
│   └── web/                @azor/web         — Next.js API over mod-azor-api (App Router)
│
├── packages/
│   ├── shared/             @azor/shared      — shared TS types + mod-azor-api client (source-only)
│   └── server-module/      C++ AzerothCore module (built via AC's CMake, not Bun)
│
├── docs/                   cross-cutting docs (PLAN.md, RFCs, architecture)
├── package.json            workspaces config + cross-package scripts
├── tsconfig.base.json      shared compiler options (each package extends this)
└── bun.lock                single hoisted lockfile
```

Per-package docs live next to the code:
- `apps/discord-bot/CLAUDE.md` — bot architecture, env vars, command flow
- `apps/web/CLAUDE.md` — Next.js API architecture, routes, env vars
- `packages/server-module/README.md` — AC module conventions, persistence patterns
- `packages/shared/` — see `src/index.ts` (contract) and `src/client/` (the `mod-azor-api` client)

## Workspaces & scripts

`bun.lock` is hoisted to the root. Always install from the root so the workspace graph resolves correctly.

```bash
bun install                                   # install everything

bun run bot                                   # start the bot (dev)
bun run bot:build                             # build the bot (prod)
bun run web                                   # start the Next.js API (dev)
bun run web:build                             # build the Next.js API (prod)
bun run typecheck                             # tsc --noEmit across every workspace
bun run build                                 # build every workspace that has a build script

bun --cwd apps/discord-bot run <script>       # invoke a script in one package
bun --filter @azor/bot add <pkg>              # add a dep to a specific workspace
```

## Conventions

- **TypeScript-first.** Every TS package extends `tsconfig.base.json`. Bun runs `.ts` directly; only `@azor/shared` emits `.d.ts` when built explicitly.
- **No project references yet.** Cross-package imports work through Bun's workspace symlinks and each package's `exports` map (source-only for `@azor/shared`).
- **Path aliases stay package-local.** The bot's `@azor/*`, `@azor.lib/*`, etc. resolve only inside `apps/discord-bot/`. Outside that package use the workspace name (`@azor/shared`).
- **Shared first.** Anything consumed by more than one surface (DB column names, command verbs, version constants, the `mod-azor-api` client) belongs in `packages/shared` — not duplicated. The transport-agnostic `mod-azor-api` client lives in `@azor/shared/client`; the bot and the web API each supply their own transport.
- **Env at the edge.** Only apps (`apps/discord-bot/`, `apps/web/`) read env vars. `packages/shared` must remain pure (no `process.env`) — anything env-dependent is passed in as config.
- **Docker context = repo root.** The bot's `Dockerfile` lives at `apps/discord-bot/Dockerfile` but the build context is the monorepo root so it can reach the hoisted `bun.lock` + every workspace manifest. CI passes `file: apps/discord-bot/Dockerfile`.
- **C++ module is not an npm package.** `packages/server-module/` has no `package.json` and Bun workspaces ignore it. Build via AzerothCore's CMake.

## Architecture rule: AzerothCore DB is private to the module

External consumers (the bot today, a website or any future client) **must not connect directly to the AzerothCore databases** (`acore_auth`, `acore_characters`, `acore_world`). All reads and writes that touch AzerothCore state flow through `mod-azor-api` — SOAP today, optional HTTP later, same JSON envelope either way.

Consumers may own their own MySQL schema for app-specific state (the bot does this with `azor_bot`). That schema must live in its own database and never reference AzerothCore tables.

## Cross-package work

When a change touches both the bot and the server module (e.g. a new DB column or command), update `packages/shared` first, then both consumers. Keep `packages/shared` releases backward-compatible while either side is mid-migration.

## Skills

- `azerothcore-module-character-persistence` — use before writing any persistence in `packages/server-module/`.
- `sanity:*` skills apply if/when `apps/web` adopts Sanity for content, or an `apps/studio` is added; `apps/web` is API-only today.
