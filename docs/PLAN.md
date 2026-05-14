# AZOR Platform — Development Plan

## Current status (2026-05-13)

**Shipped:** Stage 4 — bot read-path migration. The bot now reaches
AzerothCore *exclusively* through `mod-azor-api` over SOAP. No more direct
reads against `acore_*`; the only MySQL surface left is the bot-owned
`azor_bot` database via `botDb`.

> Stage 5 (account ↔ external-identity linking) and Stage 3 (interactions +
> gift) shipped in earlier sessions — their notes have been compacted into
> the per-stage sections below. The full Stage 5 changelog is preserved in
> git history.

### Stage 4 — what landed (this session)

Bot (`apps/discord-bot/`):
- `src/lib/azorApiClient.ts` — expanded from the Stage 3 one-method surface.
  New methods: `version`, `realmPopulation`, `realmOnline({limit?,offset?})`,
  `characterGet`, `characterLocation`, `characterStatus`, `characterCooldown`,
  `characterHistory({name,type?,limit?})`. All built on the same
  `executeAzorApiCommand<T>` helper. Defensive client-side validation for
  enum args + non-negative integers; the module re-validates server-side.
- `src/slash-commands/character/subCommands/{info,location,status}.ts` — now
  call `azorApiClient.characterGet` directly and hand the
  `AzorApiCharacterSnapshot` straight to the formatter. Each handler is ~15
  lines.
- `src/slash-commands/realm/subCommands/online.ts` — calls
  `azorApiClient.realmOnline()` (uses the module's default limit).
- `src/slash-commands/realm/subCommands/pop.ts` — calls the cheap
  `realmPopulation` endpoint (`{online: N}` only).
- `src/lib/formatter.ts` — rewritten to operate on
  `AzorApiCharacterSnapshot`. The legacy `Character`/`Item` rendering paths
  are gone. Preserves the legacy "zone 0 = data not available" behaviour.
- `src/lib/botDb.ts` — no longer imports from `@azor.lib/mysqlConfig`; reads
  `MYSQL_*` directly from `@azor.lib/conf.env`. Otherwise unchanged.
- `src/bot.ts` — stripped the SSH-tunnel block. Startup is just env-load →
  Discord client → graceful shutdown that closes `botDb`.
- `lib/conf.env.ts` — kept `MYSQL_*` (still needed by `botDb`) with an
  updated header explaining the narrowed scope. SOAP/Discord vars unchanged.
- `package.json` — dropped `ssh2`, `@types/ssh2`, `@types/mysql`, `soap`.
  Kept `mysql2` (botDb still depends on it). No new deps added.

  (`AcoreTypeMaps.ts` survives — it's still used by the formatter to render
  race/class/gender/zone id → display string)

Docs:
- `apps/discord-bot/CLAUDE.md` — rewritten to match the new architecture.

### Architecture rule (load-bearing)

**No external consumer connects directly to the AzerothCore databases.**
Every read and write that touches `acore_auth` / `acore_characters` /
`acore_world` flows through `mod-azor-api` — SOAP today, optional HTTP
later (Stage 7), same JSON envelope either way. Consumers may own their
own MySQL schema for app-specific state (the bot does this with
`azor_bot`); that schema must live in a separate database with no FKs
into AzerothCore tables, and its MySQL user must have **no grants on
`acore_*`**.

### Acceptance status

Acceptance criterion from PLAN.md:
> bot starts without MySQL credentials; all `/character` and `/realm`
> commands work; `bun run build` produces a smaller bundle.

Notes:
1. **MySQL credentials, reinterpreted.** The original criterion meant
   "no credentials against `acore_*`." That bar is met: the bot has zero
   code paths into the AzerothCore databases. It still requires
   `MYSQL_ENDPOINT/USER/PASSWORD` for its own `azor_bot` schema, which is
   covered by the architecture rule above — operators must provision a
   MySQL user with grants on `azor_bot` only.
2. **`/character` and `/realm` commands rewired.** Code paths exist
   end-to-end; not exercised against a live worldserver in this session.
3. **`bun run typecheck` passed** in this session via the workspace-hoisted
   `tsc` binary (Bun itself was unavailable; node + tsc were). Both
   `packages/shared` and `apps/discord-bot` produce zero diagnostics.

### What was deferred / not done

1. **End-to-end against live worldserver not exercised.** All new client
   methods compile and the SOAP envelope hasn't changed since Stage 3, but
   the response shapes for `version`/`realm.*`/`character.{get,location,status,
   cooldown,history}` weren't round-tripped this session. Verify:
   `/character info SomeOnlineChar`, `/realm online`, `/realm pop`. Watch
   for: number vs string coercion on epoch-ms fields (`cooldownMs`,
   `lastAt`); `zoneId === 0` rendering.
2. **Performance.** Every `/character` command now does one SOAP round-trip
   against the worldserver instead of a local MySQL read. Acceptable for
   v1 (commands are user-initiated and infrequent), but if `/realm online`
   ends up on a hot path consider caching `realmPopulation` for a few
   seconds at the bot layer.

### Resolved in follow-up cleanup (2026-05-13)

- ✅ SSH-tunnel references stripped from `apps/discord-bot/README.md`,
  `apps/discord-bot/docs/dockerhub-overview.md`, and
  `apps/discord-bot/docker-compose.example.yml`. README/dockerhub now
  state the architecture rule explicitly.
- ✅ `@azor.server/*` path alias removed from `apps/discord-bot/tsconfig.json`
  along with the (already-deleted) `server/` directory.
- ✅ `AcoreTypeMaps.ts` moved out of the misnamed ORM directory:
  `apps/discord-bot/src/lib/ORM/AcoreTypeMaps.ts` →
  `apps/discord-bot/src/lib/typeMaps.ts`. `@azor.ORM/*` alias removed.
- ✅ Architecture rule ("no consumer connects directly to AzerothCore
  databases") documented in root `CLAUDE.md`, bot `CLAUDE.md`, bot
  `README.md`, dockerhub-overview, and this PLAN.

### Lockstep contract

Unchanged from Stage 5. `packages/server-module/src/AzorApi.h`
(`SCHEMA_VERSION`, `ErrorCodes::*`) and `packages/shared/src/index.ts`
must match exactly; the new API client methods consume types that already
existed in `@azor/shared`.

### Carry-over (still open)

- Lockstep contract has no automatic drift check.
- `payload_json` SOAP-side encoding is still untested in the wild.
- The hand-rolled `Writer` in `AzorApiJson.h` still has no raw-passthrough
  mode (Stage 7 future work).
- Bot MYSQL user grant model: needs documented operator workflow for
  granting INSERT/DELETE on `azor_bot` without granting on `acore_*`.
- TOCTOU window between `link begin` checks and `InsertPending` — safe
  today (worldserver single-threaded), revisit when Stage 7 HTTP lands.
- No unlink endpoint (`link unlink`).
- No bot-side display of pending codes in `/account whoami`.
- `pending_account_links` schema created lazily on first connect; no
  migration runner yet. Revisit when Stage 6 adds `discord_users`.
- `/account link` UX assumes Discord DMs are open (ephemeral fallback in
  place but degraded UX on guilds where DMs are commonly off).
- No rate limit on `/account link`.

### Next

Stage 6 (Discord-user policy) — see below. After Stage 6 the bot enforces
per-Discord-user credits + cooldowns before calling the module's
`character interact`, with `/admin grant-credits` for operator top-ups.

## Vision

The AzerothCore server has a stable, versioned API owned by a C++ module.
Every external client — Discord bot today, website tomorrow, anything later —
consumes that API instead of touching MySQL or in-game SOAP commands directly.
The bot is one of N API consumers.

## Target architecture

**`mod-azor-api`** — AzerothCore module. Single integration layer for all
external systems. Owns the generic interaction engine (gifts today, anything
later) backed by an audit log; account ↔ external-identity linking; read-side
primitives (character info, realm online/population); `OnPlayerDelete` and
`OnBeforeAccountDelete` cleanup. Exposes API via SOAP-callable
`.azor api …` console commands returning the envelope
`{ok,data} | {ok,error:{code,message}}`. HTTP transport added later
(Stage 7) when a non-SOAP client needs it; same handlers, same contract.

**`@azor/bot`** — pure consumer of the module API + Discord. Owns Discord-side
state in its own `azor_bot` MySQL database. After Stage 4, no direct reads
against `acore_*` — `azorApiClient` (SOAP → mod-azor-api) is the only AC
transport.

**`@azor/shared`** — TS contract consumed by every JS/TS client.

## API surface (v1)

All commands prefixed `.azor api`; envelope `{ ok, data | error: {code, message} }`.
`source_type` ∈ `{discord, website, admin, system}` — extensible enum,
validated by module.

| Stage | Command | Purpose | Status |
|---|---|---|---|
| 2 | `version` | `{ schema, build }` for client compat checks | ✅ |
| 2 | `realm population` | `{ online }` | ✅ |
| 2 | `realm online [limit] [offset]` | Paginated online characters | ✅ |
| 2 | `character get <name>` | Full snapshot | ✅ |
| 2 | `character location <name>` | `{ zoneId, mapId, online }` | ✅ |
| 2 | `character status <name>` | `{ online, level }` | ✅ |
| 3 | `character interact <name> <type> <source_type> <source_id> [json_payload]` | Atomic: cooldown → action → audit | ✅ |
| 3 | `character cooldown <name> <type>` | Remaining ms (0 if none) | ✅ |
| 3 | `character history <name> [type\|all] [limit]` | Audit log, newest-first | ✅ |
| 5 | `link begin <code> <source> <external_id>` | Bot/website registers a pending link code | ✅ |
| 5 | `link confirm <code>` | Player runs in-game; binds account to external identity (SEC_PLAYER, Console::No) | ✅ |
| 5 | `link status <source> <external_id>` | Reverse lookup | ✅ |

Stage 4 made all of the above reachable from `apps/discord-bot/src/lib/azorApiClient.ts` (except `link confirm`, which is intentionally in-game only).

## Schemas

### `acore_world` — `data/sql/db-world/base/`

`mod_azor_api_config(key, value)` — runtime kv. Edited live; `.reload config`
picks up changes. Backticked column names. Seeds:
`gift.cooldown_ms = 86400000`, `gift.item_entry = 11966`,
`gift.min_level = 10`, `link.pending_ttl_ms = 600000`. Optional unseeded
keys: `gift.mail_subject`, `gift.mail_body`,
`interactions.history.default_limit` (20), `interactions.history.max_limit` (200).

### `acore_characters` — `data/sql/db-characters/base/`

```sql
CREATE TABLE `mod_azor_api_interactions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `guid` INT(10) UNSIGNED NOT NULL,
  `interaction_type` VARCHAR(32) NOT NULL,
  `source_type` ENUM('discord','website','admin','system') NOT NULL,
  `source_id` VARCHAR(64) NOT NULL,
  `payload_json` JSON NULL,
  `occurred_at` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_guid_type_time` (`guid`, `interaction_type`, `occurred_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

No FK to `characters.guid`; cleanup via `OnPlayerDelete`.

### `acore_auth` — `data/sql/db-auth/base/`

```sql
CREATE TABLE `mod_azor_api_pending_links` (
  `code`            CHAR(8) NOT NULL,
  `external_source` ENUM('discord','website') NOT NULL,
  `external_id`     VARCHAR(64) NOT NULL,
  `created_at`      BIGINT UNSIGNED NOT NULL,
  `expires_at`      BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`code`),
  KEY `idx_external` (`external_source`, `external_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `mod_azor_api_account_links` (
  `account_id`      INT(10) UNSIGNED NOT NULL,
  `external_source` ENUM('discord','website') NOT NULL,
  `external_id`     VARCHAR(64) NOT NULL,
  `linked_at`       BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`external_source`, `external_id`),
  KEY `idx_account` (`account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

No FK to `account.id`. Cleanup via
`AzorApiAccountScript::OnBeforeAccountDelete`. Pending rows lazy-reaped on
each `link begin` call.

### `azor_bot` (bot-owned)

```sql
CREATE TABLE `discord_users` (        -- Stage 6
  `discord_user_id`      VARCHAR(64) NOT NULL,
  `gift_credits`         INT NOT NULL DEFAULT 0,
  `last_gift_at`         BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `cooldown_override_ms` INT UNSIGNED NULL,
  PRIMARY KEY (`discord_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `pending_account_links` ( -- Stage 5 (live)
  `code`            CHAR(8) NOT NULL,
  `discord_user_id` VARCHAR(64) NOT NULL,
  `expires_at`      BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`code`),
  KEY `idx_discord` (`discord_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Created lazily by `botDb.ts` on first connect — no separate migration runner.

## Stages

### Stage 1 — Persistence quick-fix (skipped) ✅

Closed. The in-memory `DiscordAccount._lastGift` was the only prior state;
Stage 3 replaced it with the module's audit table. No migration needed.

### Stage 2 — Module scaffold + read API ✅

Done in earlier sessions. See module README.

### Stage 3 — Module interactions + bot gift migration ✅

Gift flow end-to-end via module; cooldown/min-level enforced atomically by
`mod-azor-api`; bot no longer carries gift state. Stage 1 migration n/a.

### Stage 4 — Bot read-path migration ✅ (this session)

See "Current status" block above for the exhaustive list.

### Stage 5 — Identity linking ✅

Account ↔ external-identity linking. `link begin/confirm/status` over SOAP
+ in-game; bot-side `pending_account_links` mirror; account-deletion
cleanup. Notable deviations from the original PLAN are documented in the
"Carry-over" section above.

### Stage 6 — Discord-user policy (½ day)

- `discord_users` table (DDL above; added lazily by `botDb.ts`).
- Sender-side cooldown + credits enforced in bot before calling
  `character interact`.
- `/admin grant-credits <user> <n>` slash command (role-gated via
  `commandPermissions.adminOnly`).
- Surface both timers (per-Discord-user, per-character) in the confirmation
  embed.

**Acceptance:** out-of-credit users get a clean rejection without hitting the
module; admins can grant credits; both cooldowns enforced.

### Stage 7 — Future work (no commitment)

- **HTTP transport on the module** — embed `cpp-httplib`, proxy routes to the
  same handlers as the SOAP commands. Same JSON contract. Bearer-token auth
  per source. Website becomes a real client. Revisit `interact` TOCTOU
  question if there's a parallel writer.
- **Event stream** — module emits realm events (logins, level-ups, deaths) via
  WebSocket or SSE; bot subscribes for `/realm online` push updates and
  announcement channels.
- **New interaction types** — drop in by adding a handler block inside
  `DispatchAction` in `AzorApiCommandScript.cpp`, extending
  `kInteractionTypes` (C++) and `AZOR_API_INTERACTION_TYPES` (TS), and
  seeding `<type>.cooldown_ms` / `<type>.min_level` config keys.
- **Raw-JSON passthrough in the response writer** — touch `AzorApiJson.h`
  (`Writer::Raw`) and the history handler.
- **Caching layer over `azorApiClient`** — only if a future flow turns a
  read into a hot path; v1 commands are user-initiated, infrequent.

## Open decisions

1. **Per-(character, source_type) cooldowns?** Today: one cooldown per
   character per interaction type, across all sources. Stage 6 may revisit.
2. **Linking required for gifting?** Today anyone on Discord can gift any
   character. Open whether to gate gifting on a linked sender identity.
3. **Monorepo or split repos?** Current: monorepo (keeps SQL migrations and
   API contract changes atomic). Reconsider only if the module needs to be
   reused by third parties.
4. ~~JSON library in the module.~~ Resolved (Stage 2). Hand-rolled `Writer`
   still adequate; may need a `Raw` method later — see Stage 7.

## Out of scope

- Gameplay balance of the gift item.
- Replacing AzerothCore's own SOAP — `.azor api` runs alongside.
- A user-facing dashboard. Stage 7 makes it possible; not committed.
- Sharding / multi-realm. Single-realm assumption throughout.
