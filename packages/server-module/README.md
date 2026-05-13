# @azor/server-module

AzerothCore C++ module that pairs with the Discord bot. This package follows
the standard AzerothCore `mod-*` convention — drop the contents under
`acore/modules/mod-azor/` (or symlink it from there) when building the
worldserver.

> Not an npm package. The `package.json` is omitted on purpose so Bun
> workspaces ignore this folder. Build is driven by AzerothCore's CMake.

## Expected layout

```
packages/server-module/
├── CMakeLists.txt           # registers source files with the AC build
├── conf/
│   └── azor.conf.dist       # default module config
├── data/
│   └── sql/
│       ├── db-auth/         # acore_auth migrations (versioned)
│       ├── db-characters/   # acore_characters migrations
│       └── db-world/        # acore_world migrations
└── src/
    ├── Azor.h
    └── azor_loader.cpp      # AddSC_* registration entry point
```

## Persistence patterns

For per-character or per-account data, follow the patterns in the
`azerothcore-module-character-persistence` skill (table naming under
`acore_characters` / `acore_auth`, `CharacterDatabase` API, and the
`PlayerScript` hooks `OnPlayerLogin` / `OnPlayerLogout` / `OnPlayerSave` /
`OnPlayerDelete`). Invoke that skill before authoring new persistence code.

## Building

The module is built as part of AzerothCore's CMake invocation, not from this
repo's package manager. Typical flow:

```sh
# from your acore checkout
ln -s /Volumes/Storage/repos/azor-acore-bot/packages/server-module modules/mod-azor
cmake -B build -S . -DWITH_WARNINGS=1
cmake --build build --target worldserver -- -j$(nproc)
```

## Coordinating with the bot

Anything shared with `apps/discord-bot` (e.g. database schemas, command
verbs, version constants) should live in `packages/shared` so both sides stay
in lockstep.
