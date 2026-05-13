# AZOR

A monorepo for the AZOR project — a Discord bot and an AzerothCore server-side module that work together to extend a [AzerothCore](https://www.azerothcore.org) World of Warcraft private server.

| Package | Path | What |
|---|---|---|
| `@azor/bot` | [`apps/discord-bot`](apps/discord-bot) | Discord bot (TypeScript, discord.js v14, Bun runtime) |
| `@azor/shared` | [`packages/shared`](packages/shared) | Shared TypeScript types and helpers |
| `azor-server-module` | [`packages/server-module`](packages/server-module) | AzerothCore C++ module (built via AC's CMake) |

## Quickstart

Requires [Bun](https://bun.sh) ≥ 1.1.

```bash
bun install              # install workspace deps (hoisted at root)
bun run bot              # start the Discord bot (dev mode)
bun run typecheck        # tsc --noEmit across every TS package
```

Run scripts in a specific workspace with `bun --cwd apps/<name> run <script>` or `bun --filter @azor/<name> run <script>`.

## Discord bot

See [`apps/discord-bot/README.md`](apps/discord-bot/README.md) for setup, env vars, slash commands, and Docker deployment.

## AzerothCore module

See [`packages/server-module/README.md`](packages/server-module/README.md) for the expected module layout and how to symlink it into your `acore/modules/` tree.

## Docker

The bot ships as a multi-arch Docker image, built from the monorepo root with `apps/discord-bot/Dockerfile`. Image: `svey/azor-acore-bot` on Docker Hub. Tag scheme follows [semver-as-version on the GitHub Container workflow](.github/workflows/docker.yml).

```bash
docker build -f apps/discord-bot/Dockerfile -t azor-bot .
```

## Layout

```
.
├── apps/
│   └── discord-bot/        @azor/bot
├── packages/
│   ├── shared/             @azor/shared
│   └── server-module/      C++ AzerothCore module
├── docs/                   cross-cutting docs
├── .github/workflows/      CI (Docker image publish)
├── package.json            workspaces + root scripts
├── tsconfig.base.json      shared TS compiler options
└── bun.lock                single hoisted lockfile
```

## License

ISC. See per-package `LICENSE` files where applicable.
