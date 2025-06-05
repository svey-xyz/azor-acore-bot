import { assertValue } from "@azor.lib/assertValue";

export const TIP_ITEM_ID = assertValue(
	process.env.TIP_ITEM_ID || 11966, // Default item ID for tips - Small Sack of Coins
	'Missing environment variable: TIP_ITEM_ID'
)

export const TIP_LEVEL_REQUIREMENT = assertValue(
	process.env.TIP_LEVEL_REQUIREMENT || 10, // Default level requirement for tipping
	'Missing environment variable: TIP_LEVEL_REQUIREMENT'
)
export const TIP_COOLDOWN = assertValue(
	process.env.TIP_COOLDOWN || 60, // Default cooldown in seconds for tipping
	'Missing environment variable: TIP_COOLDOWN'
)

export const ANNOUNCE_COMMANDS_GLOBALLY = assertValue(
	process.env.ANNOUNCE_COMMANDS_GLOBALLY || 'true', // Default to true for announcing all commands in the global channel
	'Missing environment variable: ANNOUNCE_COMMANDS_GLOBALLY'
)

export const ANNOUNCE_COMMANDS_TO_PLAYERS = assertValue(
	process.env.ANNOUNCE_COMMANDS_TO_PLAYERS || 'true', // Default to true for announcing commands to targeted players
	'Missing environment variable: ANNOUNCE_COMMANDS_TO_PLAYERS'
)

export const ENABLED_COMMANDS = assertValue(
	process.env.ENABLED_COMMANDS || 'tip,character.info,character.location,character.status,realm.online,realm.pop', // comma-separated list of enabled commands
	'Missing environment variable: ENABLED_COMMANDS'
).split(',').map(cmd => cmd.trim());