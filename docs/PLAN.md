# AZOR Platform — Development Plan

## Current status (2026-05-14)

**Shipped:** Stage 6 — Discord-user policy. The bot now enforces per-Discord-user
gift credits + a per-user cooldown *before* calling the module's
`character interact`; `/admin grant-credits` lets operators top users up.

> Stages 2–5 shipped in earlier sessions. Their notes are compacted into the
> per-stage sections under "## Stages" below; full changelogs live in git
> history.

### Stage 6 — what landed (this session)

Bot (`apps/discord-bot/`):
- `src/lib/botDb.ts` — added `discord_users` to `BOT_DB_SCHEMA` (lazy
  `CREATE TABLE IF NOT EXISTS`, same idempotent path as `pending_account_links`).
  New DAO: `getDiscordUser`; `grantGiftCredits` (upsert + increment, balance
  floored at 0 via `GREATEST`); `recordGiftSpend` (atomic
  `UPDATE … WHERE gift_credits > 0` — the single point of truth against
  double-spend).
- `src/lib/giftPolicy.ts` — new. `evaluateGiftPolicy(discordUserId)` is the
  pure-read sender-side gate: credits + per-user cooldown. Cooldown window =
  `discord_users.cooldown_override_ms` if set, else `CONFIG.gift.cooldownMs`.
  Also exports `humaniseMs`.
- `src/slash-commands/character/subCommands/gift.ts` — rewritten. Policy gate
  runs before any SOAP call (out-of-credit / on-cooldown users never hit the
  module). Confirmation is now an `EmbedBuilder` surfacing both timers
  (per-user + per-character; the per-character figure comes from a
  `characterCooldown` read probe). Policy is re-checked at confirm time (the
  60s button window). On module success, `recordGiftSpend` consumes a credit +
  stamps the per-user cooldown.
- `src/slash-commands/admin/` — new command tree. `/admin grant-credits
  <user> <amount>`, gated by `adminOnly`; `amount` may be negative to deduct.
  `commandData.ts` also sets `setDefaultMemberPermissions(0)` (cosmetic
  client-side hide — `adminOnly` is the authoritative gate).
- `src/bot.ts` — `admin` added to the `COMMANDS` array.

Docs:
- `apps/discord-bot/CLAUDE.md` — architecture tree, gift-flow note, and
  known-issues section updated.

### Acceptance status

Criterion: *out-of-credit users get a clean rejection without hitting the
module; admins can grant credits; both cooldowns enforced.*

- ✅ Out-of-credit / on-cooldown rejection happens in `evaluateGiftPolicy`
  before any `azorApiClient` call.
- ✅ `/admin grant-credits` upserts `discord_users` and reports the new balance.
- ✅ Both cooldowns enforced — per-user by the bot (`giftPolicy` +
  `recordGiftSpend`), per-character by the module — and both are surfaced in
  the confirmation / success embeds.
- ⚠️ `bun run typecheck` not run (Bun unavailable in this environment, as in
  the Stage 4 session). Typechecked instead with the workspace `tsc`:
  `node node_modules/typescript/bin/tsc -p apps/discord-bot/tsconfig.json
  --noEmit` → exit 0. `packages/shared` untouched this stage.
- ⚠️ Not exercised against a live worldserver / MySQL — see deferred.

### What was deferred / not done

1. **No live run.** Credit spend, the `discord_users` lazy DDL, and the
   `characterCooldown` embed probe weren't exercised against a real `azor_bot`
   MySQL or worldserver. Verify: `/admin grant-credits` on a fresh user (row
   created lazily), `/character gift` with 0 credits (early reject), with 1
   credit (spend + cooldown stamp), and that the dual-timer embed renders.
2. **Per-user cooldown default reuses `CONFIG.gift.cooldownMs`.** The PLAN gave
   `discord_users.cooldown_override_ms` but no separate default key, so the
   per-user window defaults to the same knob as the module's per-character
   cooldown. If they must diverge, add `gift.userCooldownMs` to `config.ts` and
   change `giftPolicy.effectiveCooldownMs` (the single resolution point).
3. **Double-spend race is logged, not prevented end-to-end.** `recordGiftSpend`
   is atomic, but if it returns `false` *after* a successful module call (the
   credit was spent concurrently inside the 60s confirm window) the gift is
   delivered un-billed — logged, not rolled back. Acceptable: the worldserver
   is single-threaded and the module is the side-effecting authority. Revisit
   if a second writer appears (Stage 7 HTTP).
4. **No `/admin` for cooldown overrides or balance inspection.**
   `cooldown_override_ms` can only be set via direct SQL; there's no
   `/admin set-cooldown` or read-only `/admin credits <user>`. Out of scope for
   the Stage 6 acceptance bar.
5. **Command registration.** No deploy / register-commands script exists in the
   repo — `/admin` is in the runtime `COMMANDS` array, but pushing the new
   command *definition* to Discord is still a manual / external step.

### Architecture rule (load-bearing)

**No external consumer connects directly to the AzerothCore databases.**
Every read and write that touches `acore_auth` / `acore_characters` /
`acore_world` flows through `mod-azor-api` — SOAP today, optional HTTP later
(Stage 7), same JSON envelope either way. Consumers may own their own MySQL
schema for app-specific state (the bot does this with `azor_bot`); that schema
must live in a separate database with no FKs into AzerothCore tables, and its
MySQL user must have **no grants on `acore_*`**.

### Lockstep contract

Unchanged. Stage 6 is entirely bot-side — `discord_users` lives in the
bot-owned `azor_bot` database, touched only by `botDb.ts`. No
`packages/shared` or `packages/server-module` changes this stage. The contract
itself: `packages/server-module/src/AzorApi.h` (`SCHEMA_VERSION`,
`ErrorCodes::*`) and `packages/shared/src/index.ts` must still match exactly.

### Carry-over (still open)

- Lockstep contract has no automatic drift check.
- `payload_json` SOAP-side encoding is still untested in the wild.
- The hand-rolled `Writer` in `AzorApiJson.h` still has no raw-passthrough mode
  (Stage 7 future work).
- Bot MYSQL user grant model: still needs a documented operator workflow for
  granting on `azor_bot` (now **two** tables — `pending_account_links` +
  `discord_users`) without granting on `acore_*`.
- TOCTOU window between `link begin` checks and `InsertPending` — safe today
  (worldserver single-threaded), revisit when Stage 7 HTTP lands.
- No unlink endpoint (`link unlink`).
- No bot-side display of pending codes in `/account whoami`.
- `azor_bot` schema (`pending_account_links` + `discord_users`) is created
  lazily by `botDb.ts` on first connect — no migration runner. Fine while the
  bot owns its own DDL; revisit if a schema change ever needs a data backfill.
- `/account link` UX assumes Discord DMs are open (ephemeral fallback in place
  but degraded UX where DMs are off).
- No rate limit on `/account link`.
- Stage 4 read-path (`/character`, `/realm`) and Stage 5 linking still not
  round-tripped against a live worldserver.

### Next

Stage 7 — future work, no commitment (see the Stage 7 section). Nearest
candidates: HTTP transport on the module; raw-JSON passthrough in the response
writer.

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
state in its own `azor_bot` MySQL database (`pending_account_links`,
`discord_users`). No direct reads against `acore_*` — `azorApiClient`
(SOAP → mod-azor-api) is the only AC transport.

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

All of the above (except in-game-only `link confirm`) is reachable from
`apps/discord-bot/src/lib/azorApiClient.ts`. Stage 6 added **no** new module
commands — it consumes the existing `character interact` / `character cooldown`.

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

Both tables created lazily by `botDb.ts` (`BOT_DB_SCHEMA`) on first connect —
no separate migration runner.

```sql
CREATE TABLE `discord_users` (         -- Stage 6 (live)
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

`discord_users` rows are created lazily: `grantGiftCredits` upserts;
`recordGiftSpend` only ever touches rows that already exist (a user can't
spend a credit they were never granted).

## Stages

### Stage 1 — Persistence quick-fix (skipped) ✅

Closed. The in-memory `DiscordAccount._lastGift` was the only prior state;
Stage 3 replaced it with the module's audit table. No migration needed.

### Stage 2 — Module scaffold + read API ✅

Done in earlier sessions. `version`, `realm.*`, `character.{get,location,
status}` over SOAP. See module README.

### Stage 3 — Module interactions + bot gift migration ✅

Gift flow end-to-end via module; cooldown/min-level enforced atomically by
`mod-azor-api`; bot no longer carries gift state. `character interact /
cooldown / history` added.

### Stage 4 — Bot read-path migration ✅

Bot reaches AzerothCore *exclusively* through `mod-azor-api` over SOAP — no
direct `acore_*` reads. `azorApiClient` gained `version` / `realm.*` /
`character.{get,location,status,cooldown,history}`; the `/character` and
`/realm` subcommands and `formatter.ts` were rewritten onto
`AzorApiCharacterSnapshot`; the SSH-tunnel and ORM/cache layers were removed;
`ssh2` / `soap` deps dropped. The only MySQL surface left is the bot-owned
`azor_bot` database via `botDb`. Full changelog in git history.

### Stage 5 — Identity linking ✅

Account ↔ external-identity linking. `link begin/confirm/status` over SOAP +
in-game; bot-side `pending_account_links` mirror; account-deletion cleanup.
Notable deviations are folded into "Carry-over" above.

### Stage 6 — Discord-user policy ✅ (this session)

`discord_users` table (lazy DDL in `botDb.ts`); sender-side credits +
per-Discord-user cooldown enforced in the bot before `character interact`
(`giftPolicy.ts`); `/admin grant-credits` for operator top-ups; the
confirmation embed surfaces both the per-user and per-character timers. See
"## Current status" above for the exhaustive list and the deferred items.

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
- **`/admin` surface for policy** — `set-cooldown` (write
  `cooldown_override_ms`), read-only `credits <user>` inspection, and a
  deploy/register-commands script so new commands reach Discord without a
  manual step.

## Open decisions

1. **Per-(character, source_type) cooldowns?** The module still has one
   cooldown per character per interaction type, across all sources. Stage 6
   added an *orthogonal* per-Discord-user cooldown in the bot — it did not
   touch the module's model. Still open whether the module's cooldown should
   become source-aware.
2. **Linking required for gifting?** Today anyone on Discord with credits can
   gift any character. Open whether to gate gifting on a linked sender
   identity (Stage 6 credits are a separate, complementary gate).
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
