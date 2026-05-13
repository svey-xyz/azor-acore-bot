# AZOR Platform — Development Plan

## Current status (2026-05-13)

**Shipped:** Stage 2 — `mod-azor-api` scaffold + read-only API.

In `packages/server-module/`: CMake (uses `CopyModuleConfig`, not the deprecated
`AC_ADD_CONFIG`), `mod_azor_api.conf.dist`, `mod_azor_api_config` (acore_world)
runtime config cache with `OnStartup` / `OnAfterConfigLoad(reload)` refresh,
hand-rolled JSON envelope writer (see resolved open decision #4), and a
`.azor api …` command tree implementing `version`, `realm population`,
`realm online`, `character {get,location,status}`. All gated `SEC_ADMINISTRATOR`
+ `Console::Yes` (SOAP runs as the configured account; its security level is
the auth boundary until Stage 7 adds bearer tokens).

In `packages/shared/src/index.ts`: TS-side contract — `AZOR_API_SCHEMA`,
`AZOR_API_ERROR_CODES`, source/interaction-type enums, payload types
(`AzorApiVersionData`, `AzorApiCharacterSnapshot`, etc.), `AzorApiEnvelope<T>`,
`isAzorApiOk` / `isAzorApiErr` narrowing helpers. **Bot does not import these
yet** — Stage 4 wires it. Consume, don't duplicate.

**Lockstep contract:** `packages/server-module/src/AzorApi.h` (`SCHEMA_VERSION`,
`ErrorCodes::*`) and `packages/shared/src/index.ts` must match exactly. No
automatic drift check yet.

**Next:** Stage 3. Stage 1 (bot-side throwaway cooldown fix) is **optional**
now that the module path is unblocked — skip it unless prod cooldown drift is
actively hurting you and Stage 3 is more than a day away.

## Vision

The AzerothCore server gains a stable, versioned API owned by a C++ module.
Every external client — Discord bot today, website tomorrow, anything later —
consumes that API instead of touching MySQL or in-game SOAP commands directly.
The bot stops being a privileged integration and becomes one of N API
consumers.

## Target architecture

**`mod-azor-api`** — AzerothCore module. Single integration layer for all
external systems. Owns the generic interaction engine (gifts today, anything
later) backed by an audit log; account ↔ external-identity linking; read-side
primitives (character info, realm online/population); `OnPlayerDelete` and
`OnAccountDelete` cleanup. Exposes API via SOAP-callable `.azor api …` console
commands returning the envelope `{ok,data} | {ok,error:{code,message}}`. HTTP
transport added later (Stage 7) when a non-SOAP client needs it; same handlers,
same contract.

**`@azor/bot`** — pure consumer of the module API + Discord. Owns Discord-side
state in its own `azor_bot` MySQL database. No direct reads against
`acore_characters` / `acore_world` / `acore_auth` after Stage 4.

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
| 3 | `character interact <name> <type> <source_type> <source_id> [json_payload]` | Atomic: cooldown check → action → audit insert. `type` ∈ {`gift`,…} | ⏳ |
| 3 | `character cooldown <name> <type>` | Remaining ms (0 if none) | ⏳ |
| 3 | `character history <name> [type] [limit]` | Audit log | ⏳ |
| 5 | `link begin <code> <source> <external_id>` | Bot/website registers a pending link code | ⏳ |
| 5 | `link confirm <code>` | Player runs in-game; binds account to external identity | ⏳ |
| 5 | `link status <source> <external_id>` | Reverse lookup | ⏳ |

## Schemas

### `acore_world` — `data/sql/db-world/base/`

`mod_azor_api_config(key, value)` — shipped Stage 2. Runtime config (cooldowns,
default item entries, min-level requirements). Edited live; `.reload config`
picks up changes. Backticked column names; reserved-word risk contained.

### `acore_characters` — `data/sql/db-characters/base/` (Stage 3)

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

Single table for every interaction type. Cooldown is
`MAX(occurred_at) WHERE guid=? AND interaction_type=?` — O(1) on the composite
index. No FK to `characters.guid`; cleanup via `OnPlayerDelete` (see
`azerothcore-module-character-persistence` skill).

### `acore_auth` — `data/sql/db-auth/base/` (Stage 5)

```sql
CREATE TABLE `mod_azor_api_account_links` (
  `account_id` INT(10) UNSIGNED NOT NULL,
  `external_source` ENUM('discord','website') NOT NULL,
  `external_id` VARCHAR(64) NOT NULL,
  `linked_at` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`external_source`, `external_id`),
  KEY `idx_account` (`account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### `azor_bot` (new bot-owned DB, Stage 5+)

```sql
CREATE TABLE `discord_users` (
  `discord_user_id` VARCHAR(64) NOT NULL,
  `gift_credits` INT NOT NULL DEFAULT 0,
  `last_gift_at` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `cooldown_override_ms` INT UNSIGNED NULL,
  PRIMARY KEY (`discord_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `pending_account_links` (
  `code` CHAR(8) NOT NULL,
  `discord_user_id` VARCHAR(64) NOT NULL,
  `expires_at` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`code`),
  KEY `idx_discord` (`discord_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## Stages

### Stage 1 — Persistence quick-fix (optional, bot only)

In-prod cooldown bug: lives in `DiscordAccount` in-memory + 1-min `DataHandler`
eviction. **Skip unless prod is bleeding** — Stages 3+4 replace this anyway.

If you do ship it:
- `custom_azor_bot_gifts(guid INT UNSIGNED PK, last_gift_at BIGINT UNSIGNED)`
  in `acore_characters`. Grant the MySQL bot user
  `INSERT,UPDATE,DELETE` on that table only.
- Move `lastGift` off `DiscordAccount` onto `Character`. Storage type matches
  Stage 3 (epoch ms, `BIGINT UNSIGNED`).
- Encapsulate cooldown read/write in `src/lib/giftCooldown.ts` so Stage 3
  swaps the implementation, not the call sites.
- Comment the SQL + helper as Stage 1 throwaway.

### Stage 2 — Module scaffold + read API ✅

Done. See "Current status" block above.

### Stage 3 — Module interactions + bot gift migration (1–2 days)

- Add `mod_azor_api_interactions` (DDL in Schemas above) in
  `data/sql/db-characters/base/`.
- New `PlayerScript::OnPlayerDelete(ObjectGuid guid, uint32 accountId)` —
  `DELETE FROM mod_azor_api_interactions WHERE guid = {}`. (Wire it into the
  `AddAzorApiScripts()` aggregator.)
- Graft three handlers onto the existing `characterTable` in
  `AzorApiCommandScript.cpp`:
  - `interact <name> <type> <source_type> <source_id> [json_payload]` —
    single `CharacterDatabase` transaction: read latest `occurred_at` for
    `(guid, type)`, compare to per-type cooldown from `mod_azor_api_config`
    (`<type>.cooldown_ms`), call `.send items` if eligible (or fail with
    `cooldown` error code), then `INSERT` audit row. Use prepared statements
    here — `source_id` is user-controlled.
  - `cooldown <name> <type>` — `MAX(occurred_at)` lookup, return remaining ms.
  - `history <name> [type] [limit]` — paginated audit read.
- Seed `gift.cooldown_ms`, `gift.item_entry`, `gift.min_level` into
  `mod_azor_api_config` (extend the existing seed SQL).
- New error codes: `cooldown`, `min_level`. Add to both
  `AzorApi::ErrorCodes` and `AZOR_API_ERROR_CODES` (lockstep).
- Bot: replace `gift.ts` with one call to
  `azorApiClient.characterInteract('gift', …)`.
- Migration: copy `custom_azor_bot_gifts.last_gift_at` rows into
  `mod_azor_api_interactions` (`interaction_type='gift'`,
  `source_type='discord'`, `source_id='migrated'`); then `DROP TABLE`.
- Revoke bot MySQL user's write privileges on `acore_characters`.

**Acceptance:** gift flow end-to-end via module; cooldown enforced atomically;
Stage 1 table dropped (if it existed).

### Stage 4 — Bot read-path migration (1 day)

- `src/lib/azorApiClient.ts` — typed SOAP wrapper. Parses JSON envelope,
  surfaces structured errors (use `isAzorApiErr` from `@azor/shared`).
- Rewrite `Character.create`, `Realm`, `Item` to fetch via the client.
- Delete `server/DATABASE.ts` + `server/queries.ts` + `lib/mysqlConfig.ts` +
  `lib/sshTunnel.ts`.
- Remove `mysql2`, `ssh2` from `package.json`.
- Remove all `MYSQL_*` env vars from `lib/conf.env.ts`. Add `AZOR_API_SOAP_*`
  if distinct from existing SOAP creds, else reuse.

**Acceptance:** bot starts without MySQL credentials; all `/character` and
`/realm` commands work; `bun run build` produces a smaller bundle.

### Stage 5 — Identity linking (½ day)

- Module: `.azor api link {begin, confirm, status}`,
  `mod_azor_api_account_links`, `AccountScript::OnAccountDelete` cleanup.
- Bot: introduce `azor_bot` MySQL DB (just `pending_account_links` to start).
  New thin DATABASE class for bot-owned data only.
- Bot: `/account link` slash command — generates 8-char code
  (`crypto.randomBytes(4).toString('hex')`), inserts to
  `pending_account_links` with TTL, calls `link begin`, DMs user the in-game
  command.
- Bot: `/account whoami` calls `link status`.
- TTL reaper on `pending_account_links` — `DELETE WHERE expires_at < NOW_MS`
  on each `/account link`.

**Acceptance:** Discord user runs `/account link` → types
`.azor api link confirm <code>` in-game → `/account whoami` shows the binding.

### Stage 6 — Discord-user policy (½ day)

- `discord_users` table.
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
  per source. Website becomes a real client.
- **Event stream** — module emits realm events (logins, level-ups, deaths) via
  WebSocket or SSE; bot subscribes for `/realm online` push updates and
  announcement channels.
- **New interaction types** — drop in by adding a handler; no schema change
  (`interaction_type` column is the discriminator).

## Open decisions

1. **Per-(character, source_type) cooldowns?** Current plan: one cooldown per
   character per interaction type, across all sources. Worth considering
   whether each source (Discord, website) gets its own 24h budget per
   character.
2. **Linking required for gifting?** Today anyone on Discord can gift any
   character. Long-term, gate gifting on a linked sender identity? Or keep
   open and use linking only for richer features (claim rewards, view your
   own /played, etc.)?
3. **Monorepo or split repos?** Current: monorepo with `apps/discord-bot`,
   `packages/server-module`, `packages/shared`. Keeps SQL migrations and API
   contract changes atomic. Reconsider only if the module needs to be reused
   by third parties.
4. ~~**JSON library in the module.**~~ **Resolved (Stage 2):** rapidjson is
   not in AC's `deps/` tree (PLAN was wrong on this — verified against AC
   master). Using hand-rolled `Writer` in `AzorApiJson.h` (~90 LOC,
   round-trips through `json.loads`). Revisit only if the v1 surface grows
   enough that escape-correctness review becomes painful.

## Out of scope

- Gameplay balance of the gift item (module enforces cooldown; what the item
  *does* is unchanged).
- Replacing AzerothCore's own SOAP — `.azor api` runs alongside, doesn't
  supplant.
- A user-facing dashboard. Stage 7 makes it possible; not committed.
- Sharding / multi-realm. Single-realm assumption throughout.
