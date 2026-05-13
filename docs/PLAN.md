# AZOR Platform — Development Plan

## Current status (2026-05-13)

**Shipped:** Stage 3 — `mod-azor-api` interactions (gift cooldown + audit log)
moved server-side; bot is now a thin consumer for the write path.

What landed in this stage:
- `packages/server-module/`:
  - `data/sql/db-characters/base/mod_azor_api_interactions.sql` — audit table
    with composite `idx_guid_type_time` index. Cooldown lookup =
    `MAX(occurred_at) WHERE guid=? AND interaction_type=?` — O(1) on the
    index leftmost-prefix.
  - `data/sql/db-world/base/mod_azor_api_config.sql` — added `INSERT IGNORE`
    seeds for `gift.cooldown_ms` (86_400_000), `gift.item_entry` (11966),
    `gift.min_level` (10). Operators can override; module re-reads on
    `.reload config`.
  - `src/AzorApiInteractions.{h,cpp}` — pure persistence layer:
    `LastOccurredAt`, `AppendInsert`, `Load`, `AppendDeleteForGuid`. User-
    controlled strings (`source_id`, `payload_json`) flow through
    `CharacterDatabase.EscapeString` before fmt-substitution (we don't
    register prepared statements — that would require patching core enums in
    `CharacterDatabaseStatements.h`, which a module must not do).
  - `src/AzorApiPlayerScript.cpp` — `OnPlayerDelete` → tiny txn that calls
    `AzorApi::Interactions::AppendDeleteForGuid`. Wired into
    `AddAzorApiScripts()` via `AzorApi_loader.cpp`.
  - `src/AzorApiCommandScript.cpp` — three new handlers grafted onto
    `characterTable`: `interact`, `cooldown`, `history`. The atomic txn for
    `interact` sequences sync cooldown SELECT → mail+audit writes appended
    to one transaction → commit. Single-threaded worldserver + no other
    writer to these tables = the gap between SELECT and txn is safe (revisit
    if/when Stage 7 HTTP introduces a parallel writer). Gift action uses
    `MailDraft` so it works for offline targets too.
  - `src/AzorApi.h` — added `ErrorCodes::Cooldown` ("cooldown") and
    `ErrorCodes::MinLevel` ("min_level").
  - `CMakeLists.txt` — registered `AzorApiInteractions.cpp` and
    `AzorApiPlayerScript.cpp`.
- `packages/shared/src/index.ts`:
  - Mirrored new error codes in `AZOR_API_ERROR_CODES`.
  - Added response types: `AzorApiCharacterInteractData`,
    `AzorApiCharacterCooldownData`, `AzorApiCharacterHistoryRow`,
    `AzorApiCharacterHistoryData`.
  - `AZOR_API_INTERACTION_TYPES` stays `['gift']`.
- `apps/discord-bot/`:
  - `src/lib/azorApiClient.ts` — **new**, minimal Stage 3 surface (only
    `characterInteract`). Hand-rolled SOAP transport (no third-party SOAP
    lib), JSON envelope parsing, structured-error narrowing via
    `isAzorApiOk`/`isAzorApiErr` from `@azor/shared`. Stage 4 will expand it
    with the read-path helpers and delete `executeSoapCommand`/the MySQL
    read path together.
  - `src/slash-commands/character/subCommands/gift.ts` — rewritten to a thin
    confirm-and-call wrapper around `azorApiClient.characterInteract({
    type: 'gift', sourceType: 'discord', sourceId: user.id })`. All client-
    side cooldown/min-level/online gating removed; module is authoritative.
    Friendly mapping from `cooldown`/`min_level`/`not_found`/etc. error
    codes back to user-facing copy.
  - `src/lib/ORM/DiscordAccount.ts` — `_lastGift` field, setter, getter
    removed. State now owned by the audit table.

What was deferred / not done (read this carefully before claiming Stage 3 is
fully shipped):
1. **Stage 1 migration step intentionally skipped.** PLAN.md previously
   listed "copy `custom_azor_bot_gifts.last_gift_at` rows into
   `mod_azor_api_interactions`; then DROP TABLE." Stage 1 was never shipped
   (the cooldown lived in `DiscordAccount._lastGift` in memory, not in a
   table). No migration needed; nothing to drop. Note for ops: the in-memory
   cooldown is forfeit on rollout — gifts that happened pre-deploy don't
   count against post-deploy cooldown. Acceptable trade-off per PLAN.md
   §"Stage 1 quick-fix (optional, bot only)".
2. **`bun run typecheck` was not executed** in this session — the harness
   does not include a bash run of the workspace scripts. The next agent
   should run `bun install` and `bun run typecheck` (and `bun run build` if
   shipping) before declaring acceptance. Edits were made with care, but
   verify.
3. **MySQL grant revoke not performed.** PLAN.md said: "Revoke bot MySQL
   user's write privileges on `acore_characters`." The bot user never had
   writes there in production (Stage 1 wasn't shipped). Confirm with ops
   that the bot user is read-only across `acore_*` before Stage 4 (which
   removes MySQL entirely from the bot).
4. **`payload_json` SOAP-side encoding is untested in the wild.** The
   stack is JSON → chat-command quoting → XML entities (see
   `azorApiClient.ts`). gift.ts does not pass a payload. First real
   exerciser will be a future interaction type with structured per-call
   metadata. If you add one, write an end-to-end test before relying on it.
5. **History endpoint emits `payloadJson` as a raw JSON string**, not a
   nested JSON object. The hand-rolled writer in `AzorApiJson.h` has no
   raw-passthrough mode; clients `JSON.parse(row.payloadJson)` themselves.
   Lift this restriction by adding `Writer::Raw(std::string_view)` if it
   becomes painful.
6. **Mail subject/body are read from optional config keys**
   (`gift.mail_subject`, `gift.mail_body`) with hardcoded fallbacks — not
   seeded in the SQL file (the seed file's contract is "anything not
   actually read by the module yet stays out"; these are read with
   fallbacks, so seeding is optional). Operators may insert them manually if
   they want to customize.
7. **TOCTOU on concurrent `interact` calls** for the same `(guid, type)` is
   accepted: worldserver runs handlers single-threaded, and there's no other
   writer to the audit table. Stage 7 (HTTP) must revisit if it introduces a
   parallel writer — likely solution is `INSERT … SELECT … WHERE NOT EXISTS`
   on a uniqueness key or row-level locking.

**Lockstep contract:** `packages/server-module/src/AzorApi.h`
(`SCHEMA_VERSION`, `ErrorCodes::*`, including the new `Cooldown` and
`MinLevel`) and `packages/shared/src/index.ts` must match exactly. No
automatic drift check yet.

**Next:** Stage 4 (bot read-path migration). Skip Stage 1; it's a closed
question.

## Vision

The AzerothCore server has a stable, versioned API owned by a C++ module.
Every external client — Discord bot today, website tomorrow, anything later —
consumes that API instead of touching MySQL or in-game SOAP commands directly.
The bot is one of N API consumers.

## Target architecture

**`mod-azor-api`** — AzerothCore module. Single integration layer for all
external systems. Owns the generic interaction engine (gifts today, anything
later) backed by an audit log; account ↔ external-identity linking; read-side
primitives (character info, realm online/population); `OnPlayerDelete` (done)
and `OnAccountDelete` (Stage 5) cleanup. Exposes API via SOAP-callable
`.azor api …` console commands returning the envelope
`{ok,data} | {ok,error:{code,message}}`. HTTP transport added later
(Stage 7) when a non-SOAP client needs it; same handlers, same contract.

**`@azor/bot`** — pure consumer of the module API + Discord. Owns Discord-side
state in its own `azor_bot` MySQL database (Stage 5+). No direct reads against
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
| 3 | `character interact <name> <type> <source_type> <source_id> [json_payload]` | Atomic: cooldown → action → audit | ✅ |
| 3 | `character cooldown <name> <type>` | Remaining ms (0 if none) | ✅ |
| 3 | `character history <name> [type\|all] [limit]` | Audit log, newest-first | ✅ |
| 5 | `link begin <code> <source> <external_id>` | Bot/website registers a pending link code | ⏳ |
| 5 | `link confirm <code>` | Player runs in-game; binds account to external identity | ⏳ |
| 5 | `link status <source> <external_id>` | Reverse lookup | ⏳ |

## Schemas

### `acore_world` — `data/sql/db-world/base/` (Stage 2 + Stage 3 seeds)

`mod_azor_api_config(key, value)` — runtime kv. Edited live; `.reload config`
picks up changes. Backticked column names. Stage 3 seeds:
`gift.cooldown_ms = 86400000`, `gift.item_entry = 11966`,
`gift.min_level = 10`. Optional keys read with fallbacks but unseeded:
`gift.mail_subject`, `gift.mail_body`, `interactions.history.default_limit`
(20), `interactions.history.max_limit` (200).

### `acore_characters` — `data/sql/db-characters/base/` (Stage 3 ✅)

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

No FK to `characters.guid`; cleanup via `OnPlayerDelete` (see
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

### Stage 1 — Persistence quick-fix (skipped, never shipped)

Closed question. The in-memory `DiscordAccount._lastGift` was the only prior
state; Stage 3 replaced it with the module's audit table. No migration was
needed. Stage 3 cooldown begins from zero post-deploy.

### Stage 2 — Module scaffold + read API ✅

Done in earlier sessions. See module README.

### Stage 3 — Module interactions + bot gift migration ✅

See "Current status" block above for the exhaustive list. Acceptance summary:
gift flow end-to-end via module; cooldown/min-level enforced atomically by
`mod-azor-api`; bot no longer carries gift state. Stage 1 migration n/a.

### Stage 4 — Bot read-path migration (1 day)

- `src/lib/azorApiClient.ts` — **already exists** as of Stage 3 with a
  one-method surface (`characterInteract`). Expand it with `version`,
  `realm.population`, `realm.online`, `character.{get,location,status}`,
  `character.{cooldown,history}` if useful (the last two are likely
  bot-internal admin helpers). Parses JSON envelope, surfaces structured
  errors. Same SOAP transport as Stage 3.
- Rewrite `Character.create`, `Realm`, `Item` to fetch via the client.
- Delete `server/DATABASE.ts` + `server/queries.ts` + `lib/mysqlConfig.ts` +
  `lib/sshTunnel.ts`.
- Remove `mysql2`, `ssh2` from `package.json`.
- Remove all `MYSQL_*` env vars from `lib/conf.env.ts`. Add `AZOR_API_SOAP_*`
  if distinct from existing SOAP creds, else reuse.
- Also delete `executeSoapCommand.ts` — its only remaining consumer was
  `gift.ts`, which Stage 3 migrated to `azorApiClient`. Grep before deleting
  in case anything else picked it up.

**Acceptance:** bot starts without MySQL credentials; all `/character` and
`/realm` commands work; `bun run build` produces a smaller bundle.

### Stage 5 — Identity linking (½ day)

- Module: `.azor api link {begin, confirm, status}`,
  `mod_azor_api_account_links`, `AccountScript::OnAccountDelete` cleanup.
  Add a sibling `linkTable` to the existing command tree in
  `AzorApiCommandScript.cpp`.
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
  per source. Website becomes a real client. Revisit `interact` TOCTOU
  question (see Stage 3 deferred item #7) if there's a parallel writer.
- **Event stream** — module emits realm events (logins, level-ups, deaths) via
  WebSocket or SSE; bot subscribes for `/realm online` push updates and
  announcement channels.
- **New interaction types** — drop in by adding a handler block inside
  `DispatchAction` in `AzorApiCommandScript.cpp`, extending
  `kInteractionTypes` (C++) and `AZOR_API_INTERACTION_TYPES` (TS), and
  seeding `<type>.cooldown_ms` / `<type>.min_level` config keys. No schema
  change required — `interaction_type` is the discriminator.
- **Raw-JSON passthrough in the response writer** — see Stage 3 deferred
  item #5. Touch `AzorApiJson.h` (`Writer::Raw`) and the history handler.

## Open decisions

1. **Per-(character, source_type) cooldowns?** Current plan: one cooldown per
   character per interaction type, across all sources. Worth considering
   whether each source (Discord, website) gets its own 24h budget per
   character. Stage 6 may revisit when sender-side budgets land.
2. **Linking required for gifting?** Today anyone on Discord can gift any
   character. Long-term, gate gifting on a linked sender identity? Or keep
   open and use linking only for richer features (claim rewards, view your
   own /played, etc.)?
3. **Monorepo or split repos?** Current: monorepo. Keeps SQL migrations and
   API contract changes atomic. Reconsider only if the module needs to be
   reused by third parties.
4. ~~**JSON library in the module.**~~ **Resolved (Stage 2):** hand-rolled
   `Writer` in `AzorApiJson.h`. Stage 3 confirmed it's still adequate. May
   need a `Raw` method when a future endpoint wants to nest stored JSON —
   see Stage 7 future work.

## Out of scope

- Gameplay balance of the gift item (module enforces cooldown; what the item
  *does* is unchanged).
- Replacing AzerothCore's own SOAP — `.azor api` runs alongside, doesn't
  supplant.
- A user-facing dashboard. Stage 7 makes it possible; not committed.
- Sharding / multi-realm. Single-realm assumption throughout.
