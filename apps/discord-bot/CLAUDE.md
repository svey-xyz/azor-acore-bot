# CLAUDE.md — @azor/bot

Discord bot that bridges an [AzerothCore](https://www.azerothcore.org) WoW private server with a Discord server via slash commands.

> Part of the AZOR monorepo (`/CLAUDE.md` at the repo root). This file documents the bot package only. Shared types live in `packages/shared`; the AzerothCore C++ module lives in `packages/server-module`.

## Architecture

```
src/
  bot.ts                    — Entry point: async main(), tunnel init, Discord client setup
  command.ts                — Command interface
  subCommand.ts             — SubCommand interface
  slash-commands/
    character/              — /character {info,location,status,gift}
    realm/                  — /realm {online,pop}
  lib/
    db.ts                   — Singleton DATABASE instance + DataHandler cache layer
    executeSoapCommand.ts   — SOAP client wrapper for AzerothCore remote access
    formatter.ts            — Discord embed/response formatting helpers
    ORM/                    — Hand-rolled ORM: Character, Item, Realm, DiscordAccount
server/
  DATABASE.ts               — mysql2 connection manager + typed query dispatcher
  queries.ts                — QUERIES enum, typed args/return types, raw SQL
lib/
  conf.env.ts               — Required env vars (throws if missing)
  options.env.ts            — Optional env vars with defaults (gift config, flags)
  ssh.env.ts                — Optional SSH tunnel env vars
  mysqlConfig.ts            — Mutable MySQL connection config (patched by tunnel at startup)
  sshTunnel.ts              — SSH tunnel manager (ssh2): local net.Server → remote MySQL
  assertValue.ts            — Generic env assertion helper
@types/
  global.d.ts               — Augments discord.js Client with `commands` collection
```

**Data flow:** Discord interaction → `bot.ts` → `command.execute()` → subcommand handler → ORM object → `DATABASE.query.*` (MySQL) or `executeSoapCommand` (SOAP) → formatted Discord reply.

**Write path:** All writes go through SOAP (AzerothCore remote access). MySQL connections are read-only by convention — use a read-only MySQL user in production.

**Caching:** ORM objects cache their DB state; stale detection is per-object. No external cache layer.

## Stack

- **Runtime:** Bun (use `bun` for all install/run commands)
- **Language:** TypeScript 6, strict mode, `moduleResolution: nodenext`
- **Discord:** discord.js v14 (slash commands only, no message content intent)
- **Database:** mysql2 (direct or via SSH tunnel to AzerothCore DBs)
- **SSH tunnel:** `ssh2` + Node `net` — optional, replaces direct MySQL exposure
- **SOAP:** `soap` package → AzerothCore SOAP endpoint for writes
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
| `@azor.server/*` | `server/*` |
| `@azor.ORM/*` | `src/lib/ORM/*` |
| `@azor.slash-commands/*` | `src/slash-commands/*` |
| `@azor.types/*` | `@types/*` |

Note: `baseUrl` is deprecated in TS 6. `"ignoreDeprecations": "6.0"` is set in `tsconfig.json` to silence this while the project migrates to TS 7-style resolution.

## Environment Variables

### Required (bot will throw on startup if missing)

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Bot token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Application ID |
| `SOAP_ENDPOINT` | AzerothCore SOAP host |
| `SOAP_PORT` | AzerothCore SOAP port (default: 7878) |
| `SOAP_USER` | SOAP admin username |
| `SOAP_PASSWORD` | SOAP admin password |
| `MYSQL_ENDPOINT` | MySQL host |
| `MYSQL_PORT` | MySQL port (default: 3306) |
| `MYSQL_USER` | MySQL user (read-only recommended) |
| `MYSQL_PASSWORD` | MySQL password |

### Optional (have defaults)

| Variable | Default | Description |
|---|---|---|
| `TIP_ITEM_ID` | `11966` | Item entry ID for `/character gift` (Small Sack of Coins) |
| `GIFT_LEVEL_REQUIREMENT` | `10` | Min character level to receive a gift |
| `GIFT_COOLDOWN` | `86400000` | Gift cooldown in ms (1 day) |
| `ANNOUNCE_COMMANDS_GLOBALLY` | `true` | Broadcast command use to the server |
| `ANNOUNCE_COMMANDS_TO_PLAYERS` | `true` | Announce to the targeted player |
| `ENABLED_COMMANDS` | all | Comma-separated list of enabled commands |

### SSH tunnel (all optional; only read when `SSH_TUNNEL_ENABLED=true`)

| Variable | Default | Description |
|---|---|---|
| `SSH_TUNNEL_ENABLED` | `false` | Route MySQL through SSH instead of direct TCP |
| `SSH_HOST` | — | SSH server hostname / IP (the AzerothCore machine) |
| `SSH_PORT` | `22` | SSH port |
| `SSH_USER` | — | SSH username on the remote server |
| `SSH_PRIVATE_KEY_PATH` | — | Absolute path to the private key file (key-based auth only) |
| `MYSQL_REMOTE_HOST` | `127.0.0.1` | MySQL host as seen from the SSH server |
| `SSH_TUNNEL_LOCAL_PORT` | `13306` | Local port the tunnel binds to on the bot's machine |

**How it works:** `bot.ts` calls `createSSHTunnel()` before `client.login()`. The tunnel creates a local `net.Server` on `SSH_TUNNEL_LOCAL_PORT`, connects to the SSH server, and `forwardOut`s each incoming socket to `MYSQL_REMOTE_HOST:MYSQL_PORT` on the remote. It then patches `MYSQL_CONFIG.host/port` so `DATABASE` connects through the tunnel. SSH keepalives are sent every 10 s; if the connection drops it reconnects automatically after 5 s. Old mysql2 connections are evicted on error so they're recreated through the new tunnel stream.

## Adding a Command

1. Create `src/slash-commands/<name>/commandData.ts` — `SlashCommandBuilder` definition
2. Create `src/slash-commands/<name>/<name>.ts` — implement the `Command` interface
3. Add subcommands under `src/slash-commands/<name>/subCommands/`
4. Register in `src/bot.ts` COMMANDS array

## Adding a DB Query

1. Add an entry to `QUERIES` enum in `server/queries.ts`
2. Map it to a `DATABASES` entry in `databaseMap`
3. Add typed args to `queryArgType` and return type to `expectedQueryReturnType`
4. Add the SQL `case` in the `queries()` switch
5. Expose a typed wrapper in `DATABASE.query` in `server/DATABASE.ts`

## Deployment

Designed to run as a Docker container on the same network as AzerothCore. The Dockerfile is multi-stage (deps → runtime), built from the **monorepo root** as context with `-f apps/discord-bot/Dockerfile`. Runtime uses Bun directly on `.ts` source — no compile step.

Bot OAuth URL: `https://discord.com/api/oauth2/authorize?client_id=<DISCORD_CLIENT_ID>&permissions=581085722147905&scope=bot%20applications.commands`

## Known Issues / Roadmap

- Role-based command restrictions not yet implemented (`commandPermissions.ts` has `adminOnly` helper ready)
- `conf.env.ts` uses `require('dotenv')` (CJS-style) — migrate to `import 'dotenv/config'`
- `baseUrl` in tsconfig is deprecated in TS 6; plan migration before TS 7
- No test suite yet
