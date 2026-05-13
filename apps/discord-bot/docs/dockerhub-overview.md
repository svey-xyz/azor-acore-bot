# azor-acore-bot

Discord bot that bridges an [AzerothCore](https://www.azerothcore.org) WoW private server with a Discord server via slash commands. Look up character info, location, online status, send in-game gifts, and check realm population — all from Discord.

- **Source / docs:** https://github.com/svey-xyz/azor-acore-bot
- **License:** ISC
- **Architectures:** `linux/amd64`, `linux/arm64`

## Configuration model

- **`.env`** holds secrets and endpoints (Discord token, SOAP, MySQL, SSH).
- **`/config/azor.config.json`** holds non-secret behaviour (gift item, cooldowns, announcements, enabled commands). The image ships sensible defaults — mount your own file only if you want to override them.
- **`/config/ssh_key`** (optional) is read when `SSH_TUNNEL_ENABLED=true`. Drop it in the same `/config` mount as the JSON file.

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

Drop this onto the same Docker network as your AzerothCore stack and the bot will reach the worldserver (SOAP) and MySQL by service name.

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

Optional env vars for SSH tunneling (`SSH_TUNNEL_ENABLED`, `SSH_HOST`, `SSH_PORT`, `SSH_USER`, `SSH_PRIVATE_KEY_PATH`, `MYSQL_REMOTE_HOST`, `SSH_TUNNEL_LOCAL_PORT`) and config file overrides (`AZOR_CONFIG_PATH`) are documented in the [README](https://github.com/svey-xyz/azor-acore-bot#readme).

## SSH tunnel

When `SSH_TUNNEL_ENABLED=true` the bot opens an SSH connection to `SSH_HOST` and forwards `127.0.0.1:SSH_TUNNEL_LOCAL_PORT` → `MYSQL_REMOTE_HOST:MYSQL_PORT` on the remote machine, so MySQL never needs to be reachable over the network.

1. Mount your private key at `./config/ssh_key` (chmod 600).
2. On the AzerothCore host, add the matching public key with locked-down `authorized_keys` options:
   ```
   restrict,port-forwarding,permitopen="127.0.0.1:3306" ssh-ed25519 AAAA…
   ```
3. Bind MySQL to `127.0.0.1` so it's only reachable through the tunnel.

## Security notes

- Runs as non-root (`bun` user, UID 1000).
- `tini` is PID 1 — `docker stop` cleanly shuts the Discord client down.
- The bot needs **read-only** MySQL access; all writes go through SOAP.
- Treat `DISCORD_TOKEN` / `SOAP_PASSWORD` / the SSH key as secrets — use `--env-file`, Docker secrets, or your orchestrator's secret store, and mount `/config` read-only.

## Issues & contributions

Please file issues and PRs against the [GitHub repo](https://github.com/svey-xyz/azor-acore-bot).
