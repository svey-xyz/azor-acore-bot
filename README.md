# Azor
An [AzerothCore](https://www.azerothcore.org) integrated [Discord](https://discord.com) bot - **by [svey](https://github.com/svey-xyz)**

**Work in progress!** More updates coming soon.

## Introduction
**Azor** connects to your [AzerothCore](https://www.azerothcore.org) server and your [Discord](https://discord.com) server to add some fun and useful [slash commands](https://support-apps.discord.com/hc/en-us/articles/26501837786775-Slash-Commands-FAQ) for your Discord users.

### Features
**Characters** | Interact with your characters by fetching data or sending gifts.

**Realm** | Get live information about online players and realm status.

**Ease of use** | **Azor** makes use of standard [Discord slash commands](https://support-apps.discord.com/hc/en-us/articles/26501837786775-Slash-Commands-FAQ) all of your users will be at home operating this bot.

**Data Safety** | Your data stays on your network, no write permissions required.

**Caching** | No need to worry about command spam flooding your database calls, **Azor** intelligently caches data and updates stale objects only when needed.

**Versatile Deployment** | Easily deploy to docker, or run as a native [node application](https://nodejs.org/en) the choice is up to you.

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

## Tech
**Type safety** | Written in [Typescript](https://www.typescriptlang.org/) and making use of full end-to-end type safety.

**Hand-rolled ORM** | Nothing screams custom built quite like a hand-rolled ORM. This project required an interesting blend of data from [AzerothCore](https://www.azerothcore.org), [Discord](https://discord.com), and custom data types that I felt would be best handled by a custom solution.

**Data Safety** | This bot connects directly to your MySQL [AzerothCore](https://www.azerothcore.org) database, however, it is recommended that you create a read-only user for the bot. All commands that write data do so through [SOAP](https://www.azerothcore.org/wiki/remote-access#soap).

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