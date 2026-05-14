# Azor
An [AzerothCore](https://www.azerothcore.org) integrated [Discord](https://discord.com) bot - **by [svey](https://github.com/svey-xyz)**

**Work in progress!** More updates coming soon.

## Introduction
**Azor** connects to your [AzerothCore](https://www.azerothcore.org) server and your [Discord](https://discord.com) server to add some fun and useful [slash commands](https://support-apps.discord.com/hc/en-us/articles/26501837786775-Slash-Commands-FAQ) for your Discord users.

### Features
**Characters** | Interact with your characters by fetching data or sending gifts.

**Realm** | Get live information about online players and realm status.

**Ease of use** | **Azor** makes use of standard [Discord slash commands](https://support-apps.discord.com/hc/en-us/articles/26501837786775-Slash-Commands-FAQ) all of your users will be at home operating this bot.

**Data Safety** | The bot never connects to the AzerothCore databases. All AzerothCore reads and writes go through a dedicated server-side module (`mod-azor-api`) over SOAP, so the bot only needs SOAP credentials plus its own private MySQL schema (`azor_bot`) for Discord-side state.

**One-command deploy** | Ships as a multi-arch (`amd64`/`arm64`) [Docker image on Docker Hub](https://hub.docker.com/r/svey/azor-acore-bot) — fully configurable via environment variables.

## Install

**Azor** is distributed as a single [Docker image](https://hub.docker.com/r/svey/azor-acore-bot) for `linux/amd64` and `linux/arm64`. Configuration is split in two:

- **Secrets and endpoints** (Discord token, SOAP credentials, MySQL credentials for the bot's own `azor_bot` schema) → environment variables, supplied via `.env` or your orchestrator's secret store.
- **Behaviour** (gift item, cooldowns, announcement flags, command allow-list) → JSON config file mounted into the container at `/config/azor.config.json`.

The image ships with sensible defaults baked in, so the only thing strictly required to run is the `.env` file.

### Architecture in one breath

The bot does **not** talk to AzerothCore's MySQL databases at all. Every read and write that touches `acore_*` data goes over SOAP to the **`mod-azor-api`** server module, which owns the contract and the audit trail. The MySQL credentials in `.env` are for the bot's **own** schema (`azor_bot`) — used for Discord-side state (pending account-link codes, per-user gift policy) — and should be a separate, low-privilege MySQL user with grants on `azor_bot` only.

### 1. Prerequisites
- An AzerothCore server you can reach over the network, with:
	- **`mod-azor-api`** loaded on the worldserver (see `packages/server-module/` in the source repo).
	- **SOAP** enabled on the worldserver. See the [AzerothCore SOAP guide](https://www.azerothcore.org/wiki/remote-access#soap).
- A **MySQL** server (can be the same instance as AzerothCore's, or a separate one) with:
	- A database named `azor_bot` (the bot creates its tables lazily on first connect).
	- A MySQL user with INSERT/SELECT/UPDATE/DELETE on `azor_bot` and **no grants on `acore_*`**.
- A Discord application + bot user. Create one at the [Discord Developer Portal](https://discord.com/developers/applications):
	1. **New Application** → name it, copy the **Application ID** (`DISCORD_CLIENT_ID`).
	2. **Bot** tab → **Reset Token** → copy the token (`DISCORD_TOKEN`). Treat this like a password.
	3. **Bot → Privileged Gateway Intents**: enable **Server Members Intent** and **Presence Intent**.
	4. Invite the bot to your server:
		 ```
		 https://discord.com/api/oauth2/authorize?client_id=<DISCORD_CLIENT_ID>&permissions=581085722147905&scope=bot%20applications.commands
		 ```
- [Docker](https://docs.docker.com/get-docker/) (24+ recommended).

### 2. Configure

#### `.env` — secrets & endpoints

Copy the example and fill it in:

```bash
curl -fsSLO https://raw.githubusercontent.com/svey-xyz/azor-acore-bot/main/.env.example
mv .env.example .env
$EDITOR .env
```

Required:

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Bot token from the Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Application ID |
| `SOAP_ENDPOINT` | Hostname/IP of the AzerothCore worldserver |
| `SOAP_PORT` | AzerothCore SOAP port (default `7878`) |
| `SOAP_USER` | SOAP admin username (used by `mod-azor-api` for `link begin`/`link status`) |
| `SOAP_PASSWORD` | SOAP admin password |
| `MYSQL_ENDPOINT` | Hostname/IP of the MySQL server hosting the bot's `azor_bot` schema |
| `MYSQL_PORT` | MySQL port (default `3306`) |
| `MYSQL_USER` | MySQL user with grants on `azor_bot` only (no `acore_*` grants) |
| `MYSQL_PASSWORD` | MySQL password |

Misc:

| Variable | Default | Description |
|---|---|---|
| `AZOR_BOT_MYSQL_DATABASE` | `azor_bot` | Override the bot-owned database name |
| `AZOR_CONFIG_PATH` | `/config/azor.config.json` | Where to load the JSON config from |

#### `/config/azor.config.json` — behaviour

The image ships defaults at `/config/azor.config.json`. To override, drop your own file at `./config/azor.config.json` and mount `./config:/config:ro`. The example compose file already does this.

```jsonc
{
  "$schema": "./azor.config.schema.json",
  "gift": {
    "itemId": 11966,            // Item template entry (Small Sack of Coins)
    "minLevel": 10,             // Min recipient character level
    "cooldownMs": 86400000      // 24h
  },
  "announcements": {
    "global": true,             // Broadcast command use to the realm
    "toPlayer": true            // Whisper the targeted player
  },
  "commands": {
    "enabled": [                // Allow-list of slash subcommands
      "character.info",
      "character.location",
      "character.status",
      "character.gift",
      "realm.online",
      "realm.pop"
    ]
  }
}
```

A JSON Schema ships at `config/azor.config.schema.json` for editor autocomplete and validation. The legacy env vars (`TIP_ITEM_ID`, `GIFT_LEVEL_REQUIREMENT`, `GIFT_COOLDOWN`, `ANNOUNCE_COMMANDS_GLOBALLY`, `ANNOUNCE_COMMANDS_TO_PLAYERS`, `ENABLED_COMMANDS`) still work as overrides if you want to tweak a single value without rebuilding the volume.

> Need MySQL behind a tunnel? The bot no longer ships its own SSH client (gone in Stage 4 once direct AzerothCore reads were retired). If your `azor_bot` schema lives somewhere only reachable over SSH/VPN, run the tunnel **outside** the container — `autossh`, a k8s sidecar, a `ssh -L` on the host, or your orchestrator's networking — and point `MYSQL_ENDPOINT` at the local end of it.

### 3. Run

#### `docker run` (single container)

```bash
docker run -d \
	--name azor-acore-bot \
	--env-file .env \
	-v "$PWD/config:/config:ro" \
	--restart unless-stopped \
	svey/azor-acore-bot:latest
```

The `-v` mount is only needed if you're overriding the defaults.

If your AzerothCore stack runs in Docker, join its network so the bot can resolve service names:

```bash
docker run -d \
	--name azor-acore-bot \
	--env-file .env \
	-v "$PWD/config:/config:ro" \
	--network <your-acore-network> \
	--restart unless-stopped \
	svey/azor-acore-bot:latest
```

#### `docker compose` (recommended)

Grab the example compose file and stand it up next to your AzerothCore services:

```bash
curl -fsSLO https://raw.githubusercontent.com/svey-xyz/azor-acore-bot/main/docker-compose.example.yml
mv docker-compose.example.yml docker-compose.yml
docker compose up -d
```

Pin a specific image version with `AZOR_TAG`:

```bash
AZOR_TAG=1.2.3 docker compose up -d
```

#### Tags

| Tag | Meaning |
|---|---|
| `latest` | Latest stable release |
| `1`, `1.2`, `1.2.3` | Semver — pin to the level of stability you want |
| `edge` | Built from `main` on every push |
| `sha-<short>` | A specific commit |

#### Logs

```bash
docker logs -f azor-acore-bot
# or
docker compose logs -f azor
```

You should see `[config] loaded /config/azor.config.json` followed by `Ready! Logged in as <bot-name>#0000` once the bot connects.

### Operational notes

- The container runs as a non-root `bun` user (UID 1000) with `tini` as PID 1 — `docker stop` / `docker compose down` shut the Discord client down cleanly.
- The only optional volume is `/config` (read-only). The bot keeps no on-disk state otherwise; restart it freely.
- Resource footprint is small (≈ 100–150 MB RSS). The compose example sets a 256 MB cap.
- All AzerothCore reads and writes go through SOAP → `mod-azor-api`. The MySQL user the bot uses needs grants on its own `azor_bot` schema only — **never on `acore_*`**.

### Build from source

If you'd rather build the image yourself:

```bash
git clone https://github.com/svey-xyz/azor-acore-bot.git
cd azor-acore-bot
docker build -t azor-acore-bot:dev .
```

For local hacking without Docker, see [Development](#development) below.

## Commands
### Character
Character commands to interact and get information.

**info** | returns character information like level, class, etc.
```discord
	/character info [username]
```

**location** | returns character location.
```discord
	/character location [username]
```

**status** | returns character's online status.
```discord
	/character status [username]
```

**gift** | sends a small gift to the character. The item, minimum recipient level, and cooldown can all be configured, see [Config](#config).

```discord
	/character gift [username]
```

### Realm
**characters** | returns a list of currently online characters.

```discord
	/realm characters
```

**pop** | returns the number of currently online characters.

```discord
	/realm pop
```

## Tech
**Type safety** | Written in [Typescript](https://www.typescriptlang.org/) and making use of full end-to-end type safety. The bot and the server module share a single TypeScript contract in `packages/shared`.

**Module-fronted API** | The bot is a pure consumer of `mod-azor-api`, an AzerothCore C++ module that owns the JSON contract, the audit log, and the read-side primitives. Today the transport is [SOAP](https://www.azerothcore.org/wiki/remote-access#soap); HTTP is planned. No client — bot, future website, anything else — touches `acore_auth` / `acore_characters` / `acore_world` directly.

**Data Safety** | The bot never opens a MySQL connection to AzerothCore. Its only MySQL connection is to its own `azor_bot` schema for Discord-side state (pending link codes, per-user gift policy). Provision that user with grants on `azor_bot` only.

## Development

The project is built with [Bun](https://bun.com). Bun runs the TypeScript entry directly and natively resolves the `tsconfig.json` `paths` aliases (`@azor/*`, `@azor.lib/*`, …), so there's no build step in dev.

```bash
git clone https://github.com/svey-xyz/azor-acore-bot.git
cd azor-acore-bot
cp .env.example .env       # then fill in values
bun install
bun src/bot.ts
```

Node ≥ 20 also works (uses `ts-node` + `tsconfig-paths` via the npm script):

```bash
npm install
npm run start
```

Produce a compiled build:

```bash
bun run build              # tsc → dist/
```

> Running the compiled `dist/bot.js` directly under Node requires `tsconfig-paths` to be registered (or a rewriter like `tsc-alias`) because `tsc` doesn't rewrite the `@azor/*` aliases. The Docker image sidesteps this by running the TS entry under Bun.

## Roadmap
**Features**
 - Restrict commands by role
 - Disable/Enable in game announcements globally and to individuals per command - *coming soon*
 - Currently I use a modified version of [0xCiBeR](https://github.com/0xCiBeR)'s [Acore_DiscordNotifier](https://github.com/0xCiBeR/Acore_DiscordNotifier) on my server to add some additional functionality. My script messages on login/logout, quest complete, level up, etc. I am considering including the modified script in with this bot as an optional addon, or alternatively building an event listener natively into the bot.

**Commands**
 - *Gift*, adding an option for discord users to select between different pre-configured gifts.
 - *Gift*, potentially adding a cost to gift giving besides cooldown (ideas welcome).
 - *Looking for additional command suggestions*

**Integrations**
 - Linking Discord id to Azeroth account in server database- this will hopefully open paths for new and interesting commands that make use of knowing which characters belong to the issuer of a Discord command.

## Notes
 - This tool was designed and built around my very low pop server. If some commands (especially realm commands) return poorly formatted responses please [submit an issue](/issues).

## Credits
 - built by [svey](https://github.com/svey-xyz).
 - Big thanks to the folks over at [AzerothCore](https://www.azerothcore.org/) for all of their incredible work.
 - Thanks to  [0xCiBeR](https://github.com/0xCiBeR) for creating [Acore_DiscordNotifier](https://github.com/0xCiBeR/Acore_DiscordNotifier), this was the initial inspiration and jumping point for this project.