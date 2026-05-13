# mod-azor-api (`@azor/server-module`)

AzerothCore C++ module exposing a stable, versioned `.azor api …` SOAP/console
command tree for external clients (Discord bot today, website tomorrow,
anything later). Implements the API contract defined in
[`docs/PLAN.md`](../../docs/PLAN.md). Pairs with `@azor/shared` for the
TypeScript-side contract types.

> Not an npm package. The `package.json` is omitted on purpose so Bun
> workspaces ignore this folder. Build is driven by AzerothCore's CMake.

## Layout

```
packages/server-module/
├── CMakeLists.txt                   # AC_ADD_SCRIPT* registrations
├── conf/
│   └── mod_azor_api.conf.dist       # module config (worldserver.conf [worldserver])
├── data/
│   └── sql/
│       ├── db-auth/base/            # Stage 5: mod_azor_api_account_links
│       ├── db-characters/base/      # Stage 3: mod_azor_api_interactions
│       └── db-world/base/
│           └── mod_azor_api_config.sql
└── src/
    ├── AzorApi.h                    # schema version, error code strings
    ├── AzorApi_loader.{h,cpp}       # AC_ADD_SCRIPT_LOADER entry point
    ├── AzorApiCharacter.{h,cpp}     # CharacterSnapshot + name → snapshot loader
    ├── AzorApiCommandScript.cpp     # `.azor api …` command tree + handlers
    ├── AzorApiConfig.{h,cpp}        # mod_azor_api_config runtime cache
    ├── AzorApiJson.h                # JSON envelope writer (hand-rolled, no deps)
    └── AzorApiWorldScript.cpp       # WorldScript: refresh config on startup / reload
```

## Stage 2 endpoints (current)

| Command | JSON `data` shape |
|---|---|
| `.azor api version` | `{ schema, build }` |
| `.azor api realm population` | `{ online }` |
| `.azor api realm online [limit] [offset]` | `{ total, limit, offset, characters[] }` |
| `.azor api character get <name>` | `CharacterSnapshot` |
| `.azor api character location <name>` | `{ zoneId, mapId, online }` |
| `.azor api character status <name>` | `{ online, level }` |

All responses use the envelope `{ ok: true, data } | { ok: false, error: { code, message } }`.
Error codes are stable strings — see `AzorApi::ErrorCodes` (C++) and
`AZOR_API_ERROR_CODES` (`@azor/shared`).

Stage 3 grafts `character interact / cooldown / history` onto the `character`
subtree. Stage 5 adds a `link` sibling.

## Building

Symlink (or copy) this folder into your AzerothCore checkout and run the
worldserver CMake invocation. The build picks up `CMakeLists.txt` via the
recursive `modules/` glob.

```sh
# from your AzerothCore checkout
ln -s /Volumes/Storage/repos/azor-acore-bot/packages/server-module modules/mod-azor-api
cmake -B build -S . -DWITH_WARNINGS=1
cmake --build build --target worldserver -- -j$(nproc)
```

On boot, the worldserver's auto-updater applies any `.sql` files under
`data/sql/db-{auth,characters,world}/` against the matching database. Edits to
`mod_azor_api_config` are picked up on `.reload config` — no redeploy.

## Persistence patterns

When adding new persistence (Stages 3, 5), follow the
`azerothcore-module-character-persistence` skill: `custom_*` / `mod_<name>_*`
table prefixes, no FK to `characters.guid`, `OnPlayerDelete` for orphan
cleanup, `CharacterDatabase` / `LoginDatabase` / `WorldDatabase` for all
queries.

## Coordinating with the bot

Anything that crosses the contract — schema version, error code strings,
source types, interaction types, command verbs — lives in `packages/shared`
and **must** match the C++ definitions in `src/AzorApi.h`. There is no
automated drift check; treat both sides as one edit.
