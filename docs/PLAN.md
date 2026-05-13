# AZOR Platform — Development Plan

## Vision

The AzerothCore server gains a stable, versioned API owned by a C++ module. Every external client — Discord bot today, website tomorrow, anything later — consumes that API instead of touching MySQL or in-game SOAP commands directly. The bot stops being a privileged integration and becomes one of N API consumers.

## Target architecture

**`mod-azor-api`** — AzerothCore module. Single integration layer for all external systems. Owns:

- Generic interaction engine (gifts today, mail/buffs/anything later) backed by an audit log
- Account ↔ external-identity linking
- Read-side primitives (character info, realm online/population)
- `PlayerScript::OnPlayerDelete` and `AccountScript::OnAccountDelete` cleanup
- Source-typed audit trail for every state-changing call

Exposes API via SOAP-callable `.azor api …` console commands returning JSON. HTTP transport is added later (Stage 7) when a non-SOAP client needs it; same handlers, same contract.

**`azor-acore-bot`** — this repo. Pure consumer of the module API + Discord. Owns Discord-side state in its own `azor_bot` MySQL database. No direct reads against `acore_characters`/`acore_world`/`acore_auth` after Stage 4.

**Future clients (website, mobile, etc.)** — same API.

## API surface (v1)

All commands prefixed `.azor api`; all responses JSON; envelope is `{ "ok": bool, "data": …, "error": { code, message } }`.

| Command | Purpose |
|---|---|
| `version` | Returns `{ schema: "v1", build: "<sha>" }` for client compat checks |
| `realm population` | Total online count |
| `realm online [limit] [offset]` | Online character list, paginated |
| `character get <name>` | Character info — replaces current `/character info` MySQL read |
| `character location <name>` | Zone / map |
| `character status <name>` | Online + level |
| `character interact <name> <type> <source_type> <source_id> [json_payload]` | Atomic: cooldown check → action → audit insert. `type` ∈ {`gift`, …future} |
| `character cooldown <name> <type>` | Remaining ms (0 if none) |
| `character history <name> [type] [limit]` | Audit log |
| `link begin <code> <source> <external_id>` | Bot/website registers a pending link code |
| `link confirm <code>` | Player runs in-game; binds their account to the external identity |
| `link status <source> <external_id>` | Reverse lookup |

`source_type` ∈ `{discord, website, admin, system}` — extensible enum, validated by module.

## Schemas

### `acore_world` (`mod_azor_api/db_world/`)
`mod_azor_api_config(key, value)` — runtime config (cooldowns per interaction type, default item entries, min-level requirements). Edited live; no redeploy.

### `acore_characters` (`mod_azor_api/db_characters/`)
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
Single table for every interaction type. Cooldown is `MAX(occurred_at) WHERE guid=? AND interaction_type=?` — O(1) on the composite index. No FK to `characters.guid`; cleanup via `OnPlayerDelete`.

### `acore_auth` (`mod_azor_api/db_auth/`)
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

### `azor_bot` (new bot-owned DB)
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

### Stage 1 — Persistence quick-fix (≤ 2 hr, bot only)
Cooldown is broken in prod (in-memory + 1-min `DataHandler` cache eviction). Ship a fix without waiting on the module.

- Bot-owned table `custom_azor_bot_gifts(guid INT UNSIGNED PK, last_gift_at BIGINT UNSIGNED)` in `acore_characters`. Grant the MySQL bot user `INSERT,UPDATE,DELETE` on that table only.
- Move `lastGift` off `DiscordAccount` onto `Character`. Storage type matches Stage 3 schema (epoch ms, `BIGINT UNSIGNED`).
- Add `QUERIES.GET_LAST_GIFT` / `QUERIES.SET_LAST_GIFT` and typed `DATABASE.query.*` wrappers.
- Encapsulate cooldown read/write in `src/lib/giftCooldown.ts` so Stage 3 swaps the implementation, not call sites.
- Update CLAUDE.md to note the narrowed read-only convention.
- Mark SQL + helper as Stage 1 throwaway in comments.

**Acceptance:** bot restart preserves per-character cooldowns; multiple Discord users cannot gift the same character within cooldown window.

### Stage 2 — Module scaffold + read API (1 day)
- Fork `skeleton-module` → `mod-azor-api`.
- `WorldScript::OnConfigLoad` reads from `mod_azor_api_config`.
- Pick a JSON lib (likely rapidjson via module CMakeLists — see open decision #4).
- `CommandScript` registers `.azor api …` tree.
- Implement read-only endpoints: `version`, `realm population`, `realm online`, `character get/location/status`.
- Deploy to a dev worldserver instance.

**Acceptance:** `SOAP .azor api realm population` returns valid JSON envelope.

### Stage 3 — Module interactions + bot gift migration (1–2 days)
- `mod_azor_api_interactions` table + `OnPlayerDelete` cleanup.
- `.azor api character interact <name> gift …` — single transaction: cooldown check → `.send items` → audit insert.
- `.azor api character cooldown` and `character history`.
- Bot: replace `gift.ts` flow with one call to `azorApiClient.characterInteract('gift', …)`.
- Migration SQL: copy `custom_azor_bot_gifts.last_gift_at` rows into `mod_azor_api_interactions` (`interaction_type='gift'`, `source_type='discord'`, `source_id='migrated'`), then `DROP TABLE custom_azor_bot_gifts`.
- Revoke bot MySQL user's write privileges on `acore_characters`.

**Acceptance:** gift flow end-to-end via module; cooldown enforced atomically; Stage 1 table dropped.

### Stage 4 — Bot read-path migration (1 day)
- Implement `src/lib/azorApiClient.ts` — typed SOAP wrapper, parses JSON envelopes, surfaces structured errors.
- Rewrite `Character.create`, `Realm`, `Item` to fetch via the client.
- Delete `server/DATABASE.ts` + `server/queries.ts` + `lib/mysqlConfig.ts` + `lib/sshTunnel.ts` (or move SSH tunnel doc to ops notes — bot no longer needs it).
- Remove `mysql2`, `ssh2` from `package.json`.
- Remove all MySQL env vars from `lib/conf.env.ts`. Add `AZOR_API_SOAP_*` if distinct, otherwise reuse existing SOAP creds.

**Acceptance:** bot starts without MySQL credentials; all `/character` and `/realm` commands work; `bun run build` produces a smaller bundle.

### Stage 5 — Identity linking (½ day)
- Module: `.azor api link begin/confirm/status`, `mod_azor_api_account_links`, `AccountScript::OnAccountDelete`.
- Bot: `azor_bot` DB introduced here (just `pending_account_links` to start). New thin DATABASE class for bot-owned data only.
- Bot: `/account link` slash command — generates 8-char code (`crypto.randomBytes(4).toString('hex')`), inserts to `pending_account_links` with TTL, calls `link begin` on the module, DMs the user with the in-game command to run.
- Bot: `/account whoami` calls `link status`.
- TTL reaper on `pending_account_links` (simple `DELETE WHERE expires_at < NOW_MS`) on each `/account link`.

**Acceptance:** Discord user runs `/account link` → types `.azor api link confirm <code>` in-game → `/account whoami` shows the binding.

### Stage 6 — Discord-user policy (½ day)
- `discord_users` table.
- Sender-side cooldown + credits enforced in bot before calling `character interact`.
- `/admin grant-credits <user> <n>` slash command (role-gated via `commandPermissions.adminOnly`).
- Surface both timers (per-Discord-user, per-character) in the confirmation embed.

**Acceptance:** out-of-credit users get a clean rejection without hitting the module; admins can grant credits; both cooldowns enforced.

### Stage 7 — Future work (no commitment, just headroom)
- **HTTP transport on the module** — embed `cpp-httplib` (header-only), proxy routes to the same handlers as the SOAP commands. Same JSON contract. Add bearer-token auth per source. Website becomes a real client.
- **Event stream** — module emits realm events (logins, level-ups, deaths) via WebSocket or SSE; bot subscribes for `/realm online` push updates and announcement channels.
- **New interaction types** — drop in by adding a handler; no schema change (the `interaction_type` column is the discriminator).

## Open decisions

1. **Monorepo or split repos?** This repo + `mod-azor-api/` subdir keeps SQL migrations and API contract changes atomic. Split repos make the module reusable by others. Recommend monorepo with `bot/` and `module/` siblings under a fresh org repo, or `module/` added here and rename root.
2. **Per-(character, source_type) cooldowns?** Today's plan: one cooldown per character per interaction type, across all sources. Worth considering whether each source (Discord, website) gets its own 24h budget per character.
3. **Linking required for gifting?** Today anyone on Discord can gift any character. Long-term, gate gifting on a linked sender identity? Or keep open and use linking only for richer features (claim rewards, view your own /played, etc.)?
4. **JSON library in the module.** AzerothCore bundles rapidjson headers but doesn't link them in the worldserver target. Confirm we can pull it via `mod-azor-api/CMakeLists.txt`, otherwise fall back to a 200-line hand-rolled serializer (sufficient for the v1 surface).

## Out of scope (explicitly not in this plan)

- Gameplay balance of the gift item (the module enforces cooldown; what the item *does* is unchanged).
- Replacing AzerothCore's own SOAP — `.azor api` runs alongside, doesn't supplant.
- A user-facing dashboard. Stage 7 makes it possible; not committed.
- Sharding / multi-realm. Single-realm assumption throughout.
