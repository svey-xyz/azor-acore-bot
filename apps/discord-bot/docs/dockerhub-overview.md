# azor-acore-bot

Discord bot that bridges an [AzerothCore](https://www.azerothcore.org) WoW private server with a Discord server via slash commands. Look up character info, location, online status, send in-game gifts, and check realm population — all from Discord.

- **Source / docs:** https://github.com/svey-xyz/azor-acore-bot
- **License:** ISC
- **Architectures:** `linux/amd64`, `linux/arm64`

## Architecture in one breath

The bot does not connect to AzerothCore's MySQL databases. All AzerothCore reads and writes go over SOAP to the **`mod-azor-api`** server module. The bot only opens MySQL connections to its **own** schema (`azor_bot`) for Discord-side state — give that MySQL user grants on `azor_bot` only.

## Configuration model

- **`.env`** holds secrets and endpoints: Discord token, SOAP credentials (the bot's only AzerothCore transport), and MySQL credentials for the bot-owned `azor_bot` schema.
- **`/config/azor.config.json`** holds non-secret behaviour (gift item, cooldowns, announcements, enabled commands). The image ships sensible defaults — mount your own file only if you want to override them.

## Quick start

```bash
docker run -d \
  --name azor-acore-bot \
  --env-file .env \
  -v "$PWD/config:/config:ro" \
  --restart unless-stopped \
  svey/azor-acore-bot:latest
```

The `-v` mount is optional — the image ships with defaults baked in.

## docker compose

```yaml
services:
  azor:
    image: svey/azor-acore-bot:latest
    container_name: azor-acore-bot
    restart: unless-stopped
    env_file: [.env]
    volumes:
      - ./config:/config:ro
    networks: [acore_network]

networks:
  acore_network:
    external: true
```

Drop this onto the same Docker network as your AzerothCore stack and the bot will reach the worldserver (SOAP) and the MySQL host that owns `azor_bot` by service name.

## Tags

| Tag | Meaning |
|---|---|
| `latest` | Newest stable release |
| `1`, `1.2`, `1.2.3` | Semver — pin to whichever level of stability you want |
| `edge` | Built from `main` on every push |
| `sha-<short>` | Specific commit |

## Required env vars

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Bot token |
| `DISCORD_CLIENT_ID` | Application ID |
| `SOAP_ENDPOINT` / `SOAP_PORT` | AzerothCore SOAP host + port (the bot's only AzerothCore transport) |
| `SOAP_USER` / `SOAP_PASSWORD` | SOAP admin credentials |
| `MYSQL_ENDPOINT` / `MYSQL_PORT` | MySQL host + port for the bot-owned `azor_bot` schema |
| `MYSQL_USER` / `MYSQL_PASSWORD` | MySQL credentials (must have grants on `azor_bot` only — no `acore_*` grants) |

Config file overrides (`AZOR_CONFIG_PATH`, `AZOR_BOT_MYSQL_DATABASE`) and behaviour overrides are documented in the [README](https://github.com/svey-xyz/azor-acore-bot#readme).

> Need MySQL behind a tunnel? Run the tunnel **outside** the container (`autossh`, k8s sidecar, host-level `ssh -L`) and point `MYSQL_ENDPOINT` at the local end. The bot dropped its bundled SSH client in Stage 4 once direct AzerothCore reads were retired.

## Security notes

- Runs as non-root (`bun` user, UID 1000).
- `tini` is PID 1 — `docker stop` cleanly shuts the Discord client down.
- All AzerothCore reads and writes go through SOAP → `mod-azor-api`. The MySQL user the bot uses must have grants on `azor_bot` only — **never on `acore_*`**.
- Treat `DISCORD_TOKEN` / `SOAP_PASSWORD` / `MYSQL_PASSWORD` as secrets — use `--env-file`, Docker secrets, or your orchestrator's secret store, and mount `/config` read-only.

## Issues & contributions

Please file issues and PRs against the [GitHub repo](https://github.com/svey-xyz/azor-acore-bot).
