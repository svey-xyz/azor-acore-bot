# azor-acore-bot

Discord bot that bridges an [AzerothCore](https://www.azerothcore.org) WoW private server with a Discord server via slash commands. Look up character info, location, online status, send in-game gifts, and check realm population — all from Discord.

- **Source / docs:** https://github.com/svey-xyz/azor-acore-bot
- **License:** ISC
- **Architectures:** `linux/amd64`, `linux/arm64`

## Quick start

```bash
docker run -d \
  --name azor-acore-bot \
  --env-file .env \
  --restart unless-stopped \
  svey/azor-acore-bot:latest
```

See [`.env.example`](https://github.com/svey-xyz/azor-acore-bot/blob/main/.env.example) for the full list of variables.

## docker compose

```yaml
services:
  azor:
    image: svey/azor-acore-bot:latest
    container_name: azor-acore-bot
    restart: unless-stopped
    env_file: [.env]
    networks: [acore_network]

networks:
  acore_network:
    external: true
```

Drop this onto the same Docker network as your AzerothCore stack and the bot will be able to reach the worldserver (SOAP) and MySQL by service name.

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
| `SOAP_ENDPOINT` / `SOAP_PORT` | AzerothCore SOAP host + port |
| `SOAP_USER` / `SOAP_PASSWORD` | SOAP admin credentials |
| `MYSQL_ENDPOINT` / `MYSQL_PORT` | AzerothCore MySQL host + port |
| `MYSQL_USER` / `MYSQL_PASSWORD` | MySQL credentials (read-only recommended) |

Optional vars (`TIP_ITEM_ID`, `GIFT_LEVEL_REQUIREMENT`, `GIFT_COOLDOWN`, `ANNOUNCE_COMMANDS_GLOBALLY`, `ANNOUNCE_COMMANDS_TO_PLAYERS`, `ENABLED_COMMANDS`) are documented in the [README](https://github.com/svey-xyz/azor-acore-bot#readme).

## Security notes

- Runs as non-root (`bun` user, UID 1000).
- `tini` is PID 1 — `docker stop` cleanly shuts the Discord client down.
- The bot needs **read-only** MySQL access; all writes go through SOAP. Create a dedicated MySQL user with `SELECT` only on `acore_characters`, `acore_auth`, `acore_world`.
- Treat `DISCORD_TOKEN` and `SOAP_PASSWORD` like any other secret — use `--env-file`, Docker secrets, or your orchestrator's secret store.

## Issues & contributions

Please file issues and PRs against the [GitHub repo](https://github.com/svey-xyz/azor-acore-bot).
