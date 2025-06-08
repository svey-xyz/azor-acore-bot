import { assertValue } from "@azor.lib/assertValue";

export const GIFT_ITEM_ENTRY = assertValue(
	parseInt(process.env.TIP_ITEM_ID || '') || 11966, // Default item ID for gifts - Small Sack of Coins
	'Missing environment variable: GIFT_ITEM_ENTRY'
)

export const GIFT_LEVEL_REQUIREMENT = assertValue(
	process.env.GIFT_LEVEL_REQUIREMENT || 10, // Default level requirement for gifting
	'Missing environment variable: GIFT_LEVEL_REQUIREMENT'
)
export const GIFT_COOLDOWN = assertValue(
	parseInt(process.env.GIFT_COOLDOWN || '') || 86400000, // 1 Day in milliseconds as default
	'Missing environment variable: GIFT_COOLDOWN'
);

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