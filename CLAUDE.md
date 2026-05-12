# CLAUDE.md — azor-acore-bot

Discord bot that bridges an [AzerothCore](https://www.azerothcore.org) WoW private server with a Discord server via slash commands.

## Architecture

```
src/
  bot.ts                    — Entry point: Discord client setup, command registration
  command.ts                — Command interface
  subCommand.ts             — SubCommand interface
  slash-commands/
    character/              — /character {info,location,status,gift}
    realm/                  — /realm {online,pop}
  lib/
    db.ts                   — Singleton DATABASE instance
    executeSoapCommand.ts   — SOAP client wrapper for AzerothCore remote access
    formatter.ts            — Discord embed/response formatting helpers
    ORM/                    — Hand-rolled ORM: Character, Item, Realm, DiscordAccount
server/
  DATABASE.ts               — mysql2 connection pool + typed query dispatcher
  queries.ts                — QUERIES enum, typed args/return types, raw SQL
lib/
  conf.env.ts               — Required env vars (throws if missing)
  options.env.ts            — Optional env vars with defaults (gift config, flags)
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
- **Database:** mysql2 (direct MySQL to AzerothCore DBs)
- **SOAP:** `soap` package → AzerothCore SOAP endpoint for writes
- **Env:** dotenv + dotenv-expand

## Commands

```bash
bun install          # install deps
bun run start        # dev: ts-node with tsconfig-paths
bun run build        # prod: tsc → dist/
```

> The `tsc` npm package in devDeps is a harmless shim — the real compiler is `typescript`. Use `./node_modules/typescript/bin/tsc` or `bunx tsc` directly.

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

Designed to run as a Docker container on the same network as AzerothCore. The Dockerfile is a multi-stage build (compile → strip devDeps → distroless). The Dockerfile currently uses `npm` — update to `bun` when moving to a newer base image.

Bot OAuth URL: `https://discord.com/api/oauth2/authorize?client_id=<DISCORD_CLIENT_ID>&permissions=581085722147905&scope=bot%20applications.commands`

## Known Issues / Roadmap

- Role-based command restrictions not yet implemented (`commandPermissions.ts` has `adminOnly` helper ready)
- `conf.env.ts` uses `require('dotenv')` (CJS-style) — migrate to `import 'dotenv/config'`
- `baseUrl` in tsconfig is deprecated in TS 6; plan migration before TS 7
- Docker build uses `node:alpine` and `npm`; migrate to `oven/bun` image
- No test suite yet
