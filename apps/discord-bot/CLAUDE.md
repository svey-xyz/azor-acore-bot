# CLAUDE.md — @azor/bot

Discord bot that bridges an [AzerothCore](https://www.azerothcore.org) WoW private server with a Discord server via slash commands.

> Part of the AZOR monorepo (`/CLAUDE.md` at the repo root). This file documents the bot package only. Shared types live in `packages/shared`; the AzerothCore C++ module lives in `packages/server-module`.

## Architecture

```
src/
  bot.ts                    — Entry point: async main(), Discord client setup, graceful shutdown
  command.ts                — Command interface
  subCommand.ts             — SubCommand interface
  slash-commands/
    account/                — /account {link,whoami}        (Stage 5)
    character/              — /character {info,location,status,gift}
    realm/                  — /realm {online,pop}
  lib/
    azorApiClient.ts        — SOAP client for `mod-azor-api` (the bot's only AC transport)
    botDb.ts                — Pool + DAO for the bot-owned `azor_bot` MySQL database
    formatter.ts            — Discord-output helpers (operate on AzorApiCharacterSnapshot)
    typeMaps.ts             — race/class/gender/zone id → display string (formerly ORM/AcoreTypeMaps.ts)
@types/
  global.d.ts               — Augments discord.js Client with `commands` collection
lib/
  conf.env.ts               — Required env vars (Discord, SOAP, MySQL for azor_bot)
  options.env.ts            — Optional env vars with defaults (back-compat shim over @azor.lib/config)
  config.ts                 — Canonical behaviour/feature config (file + env overrides)
  assertValue.ts            — Generic env assertion helper
  stringFunctions.ts        — Tiny string utils
```

After Stage 4 (2026-05-13) the bot has exactly two outbound surfaces:

- **SOAP** via `azorApiClient` → `mod-azor-api`. The bot's *only* transport for anything AzerothCore-related (reads + writes + linking). The bot must never open a connection to `acore_auth` / `acore_characters` / `acore_world` directly.
- **MySQL** via `botDb` for the bot-owned `azor_bot` database only (pending claim codes today; Stage 6 will add `discord_users`). `azor_bot` is a separate schema with no FKs into AzerothCore tables; operators should provision a MySQL user that has grants on `azor_bot` only.

**Data flow:** Discord interaction → `bot.ts` → `command.execute()` → subcommand handler → `azorApiClient` (or `botDb` for bot-owned state) → formatted Discord reply.

**No more ORM/cache layer.** The hand-rolled `Character`/`Item`/`Realm`/`DiscordAccount` classes and the `DataHandler` cache were removed in Stage 4. Subcommands now consume `AzorApiCharacterSnapshot` (from `@azor/shared`) directly. If perf-driven caching becomes useful later it should sit on top of `azorApiClient`.

## Stack

- **Runtime:** Bun (use `bun` for all install/run commands)
- **Language:** TypeScript 6, strict mode, `moduleResolution: nodenext`
- **Discord:** discord.js v14 (slash commands only, no message content intent)
- **Database:** mysql2 (the bot's own `azor_bot` database only; AC databases unreachable post-Stage 4)
- **SOAP:** hand-rolled SOAP client inside `azorApiClient.ts` (no third-party SOAP lib; `soap` was removed in Stage 4)
- **Env:** dotenv + dotenv-expand

## Commands

Run from the repo root (preferred) or from `apps/discord-bot/` directly.

```bash
# from repo root
bun install              # install workspace deps (hoisted)
bun run bot              # dev: ts-node with tsconfig-paths
bun run bot:build        # prod: tsc → apps/discord-bot/dist/

# from apps/discord-bot/
bun run start            # dev
bun run build            # prod build
bun run typecheck        # tsc --noEmit
```

> `typescript` lives at the root workspace; `ts-node` and `tsconfig-paths` are bot-local. The `tsc` shim that used to be in devDeps was removed in the monorepo migration — use `bunx tsc` if you need the binary outside an npm script.

## Path Aliases

Defined in `tsconfig.json` `paths` + registered at runtime via `tsconfig-paths`:

| Alias | Resolves to |
|---|---|
| `@azor/*` | `src/*` |
| `@azor.lib/*` | `lib/*` |
| `@azor.slash-commands/*` | `src/slash-commands/*` |
| `@azor.types/*` | `@types/*` |

Note: `baseUrl` is deprecated in TS 6. `"ignoreDeprecations": "6.0"` is set in `tsconfig.json` to silence this while the project migrates to TS 7-style resolution.

## Environment Variables

### Required (bot will throw on startup if missing)

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Bot token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Application ID |
| `SOAP_ENDPOINT` | AzerothCore SOAP host (the bot's only AC transport) |
| `SOAP_PORT` | AzerothCore SOAP port (default: 7878) |
| `SOAP_USER` | SOAP admin username (must have SEC_ADMINISTRATOR for `link begin`/`link status`) |
| `SOAP_PASSWORD` | SOAP admin password |
| `MYSQL_ENDPOINT` | MySQL host (used **only** by `botDb` for `azor_bot`) |
| `MYSQL_PORT` | MySQL port (default: 3306) |
| `MYSQL_USER` | MySQL user — needs INSERT/DELETE on `azor_bot` |
| `MYSQL_PASSWORD` | MySQL password |

### Optional (have defaults)

| Variable | Default | Description |
|---|---|---|
| `AZOR_BOT_MYSQL_DATABASE` | `azor_bot` | Override the bot-owned database name |
| `AZOR_CONFIG_PATH` | `/config/azor.config.json` | Behaviour-config JSON file location |
| `TIP_ITEM_ID` | `11966` | Item entry ID for `/character gift` (Small Sack of Coins) — overrides the JSON `gift.itemId`. The module enforces the value server-side; this is now informational on the bot side. |
| `GIFT_LEVEL_REQUIREMENT` | `10` | Min character level to receive a gift (back-compat env override of JSON `gift.minLevel`) |
| `GIFT_COOLDOWN` | `86400000` | Gift cooldown in ms (back-compat env override) |
| `ANNOUNCE_COMMANDS_GLOBALLY` | `true` | Broadcast command use to the server |
| `ANNOUNCE_COMMANDS_TO_PLAYERS` | `true` | Announce to the targeted player |
| `ENABLED_COMMANDS` | all | Comma-separated list of enabled commands |

### Removed in Stage 4

`SSH_TUNNEL_ENABLED`, `SSH_HOST`, `SSH_PORT`, `SSH_USER`, `SSH_PRIVATE_KEY_PATH`, `MYSQL_REMOTE_HOST`, `SSH_TUNNEL_LOCAL_PORT` — the bot no longer connects to the `acore_*` databases, so the optional SSH tunnel is gone. If a deployment needs the bot's own `azor_bot` MySQL behind SSH, reach for an external tunnel (autossh, `ssh -L`, k8s sidecar) instead.

## Adding a Command

1. Create `src/slash-commands/<name>/commandData.ts` — `SlashCommandBuilder` definition
2. Create `src/slash-commands/<name>/<name>.ts` — implement the `Command` interface
3. Add subcommands under `src/slash-commands/<name>/subCommands/`
4. Register in `src/bot.ts` `COMMANDS` array

## Adding an API call

1. Add a method to the `azorApiClient` object in `src/lib/azorApiClient.ts`.
2. Construct the chat-command string with `quoteForChat` for any user-supplied argument and delegate to `executeAzorApiCommand<T>` for transport + envelope parsing.
3. Add the response payload type to `packages/shared/src/index.ts` (must match the C++ module's response shape exactly).
4. The shared package is source-only (`.ts`) — no build step required for the bot to pick it up.

## Deployment

Designed to run as a Docker container on the same network as AzerothCore. The Dockerfile is multi-stage (deps → runtime), built from the **monorepo root** as context with `-f apps/discord-bot/Dockerfile`. Runtime uses Bun directly on `.ts` source — no compile step.

Bot OAuth URL: `https://discord.com/api/oauth2/authorize?client_id=<DISCORD_CLIENT_ID>&permissions=581085722147905&scope=bot%20applications.commands`

## Known Issues / Roadmap

- Role-based command restrictions not yet implemented (`commandPermissions.ts` has `adminOnly` helper ready)
- `conf.env.ts` uses `require('dotenv')` (CJS-style) — migrate to `import 'dotenv/config'`
- `baseUrl` in tsconfig is deprecated in TS 6; plan migration before TS 7
- No test suite yet
