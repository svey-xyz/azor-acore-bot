# CLAUDE.md — AZOR monorepo

Bun-workspaces monorepo for the AZOR project. Two surfaces talk to the same AzerothCore world: a Discord bot (TypeScript) and a server-side C++ module loaded by `acore-worldserver`. Shared types/helpers live in a third package so the two sides stay in lockstep.

## Layout

```
.
├── apps/
│   └── discord-bot/        @azor/bot         — discord.js v14 bot (Bun runtime)
│
├── packages/
│   ├── shared/             @azor/shared      — shared TS types/helpers (source-only)
│   └── server-module/      C++ AzerothCore module (built via AC's CMake, not Bun)
│
├── docs/                   cross-cutting docs (PLAN.md, RFCs, architecture)
├── package.json            workspaces config + cross-package scripts
├── tsconfig.base.json      shared compiler options (each package extends this)
└── bun.lock                single hoisted lockfile
```

Per-package docs live next to the code:
- `apps/discord-bot/CLAUDE.md` — bot architecture, env vars, command flow
- `packages/server-module/README.md` — AC module conventions, persistence patterns
- `packages/shared/` — see `src/index.ts`

## Workspaces & scripts

`bun.lock` is hoisted to the root. Always install from the root so the workspace graph resolves correctly.

```bash
bun install                                   # install everything

bun run bot                                   # start the bot (dev)
bun run bot:build                             # build the bot (prod)
bun run typecheck                             # tsc --noEmit across every workspace
bun run build                                 # build every workspace that has a build script

bun --cwd apps/discord-bot run <script>       # invoke a script in one package
bun --filter @azor/bot add <pkg>              # add a dep to a specific workspace
```

## Conventions

- **TypeScript-first.** Every TS package extends `tsconfig.base.json`. Bun runs `.ts` directly; only `@azor/shared` emits `.d.ts` when built explicitly.
- **No project references yet.** Cross-package imports work through Bun's workspace symlinks and each package's `exports` map (source-only for `@azor/shared`).
- **Path aliases stay package-local.** The bot's `@azor/*`, `@azor.lib/*`, `@azor.server/*`, etc. resolve only inside `apps/discord-bot/`. Outside that package use the workspace name (`@azor/shared`).
- **Shared first.** Anything consumed by both the bot and the server module (DB column names, command verbs, version constants) belongs in `packages/shared` — not duplicated.
- **Env at the edge.** Only `apps/discord-bot/` reads env vars. `packages/shared` must remain pure (no `process.env`).
- **Docker context = repo root.** The bot's `Dockerfile` lives at `apps/discord-bot/Dockerfile` but the build context is the monorepo root so it can reach the hoisted `bun.lock` + every workspace manifest. CI passes `file: apps/discord-bot/Dockerfile`.
- **C++ module is not an npm package.** `packages/server-module/` has no `package.json` and Bun workspaces ignore it. Build via AzerothCore's CMake.

## Cross-package work

When a change touches both the bot and the server module (e.g. a new DB column or command), update `packages/shared` first, then both consumers. Keep `packages/shared` releases backward-compatible while either side is mid-migration.

## Skills

- `azerothcore-module-character-persistence` — use before writing any persistence in `packages/server-module/`.
- `sanity:*` skills apply only if/when a future `apps/web` or `apps/studio` is added; ignore for now.
