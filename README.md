# Azor
An [AzerothCore](https://www.azerothcore.org) integrated [Discord](https://discord.com) bot - **by [svey](https://github.com/svey-xyz)**

## Introduction
**Azor** connects to your AzerothCore server and your Discord server to add some fun and useful [slash commands](https://support-apps.discord.com/hc/en-us/articles/26501837786775-Slash-Commands-FAQ) for your Discord users.

## Setup
Designed to run as a [Docker container](https://www.docker.com/resources/what-container/) on the same network as your [AzerothCore](https://www.azerothcore.org) server. Currently, the docker build has not been fully setup, instructions for install will come soon.

### Config
*Coming Soon*

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

## Roadmap
**Features**
 - Restrict commands by role
 - Disable/Enable in game announcements globally and to individuals per command - *coming soon*

**Commands**
 - *Gift*, adding an option for discord users to select between different pre-configured gifts.
 - *Gift*, potentially adding a cost to gift giving besides cooldown (ideas welcome).
 - *Looking for additional command suggestions*

**Integrations**

## Notes
 - This tool was designed and built around my very low pop server. If some commands (especially realm commands) return poorly formatted responses please [submit an issue](/issues).

## Credits