import { assertValue } from "@azor.lib/assertValue";

const dotenv = require('dotenv');
dotenv.config()

// ---------------------------------------------------------------------------
// Discord
// ---------------------------------------------------------------------------

export const DISCORD_TOKEN = assertValue(
	process.env.DISCORD_TOKEN,
	'Missing environment variable: DISCORD_TOKEN'
)

export const DISCORD_CLIENT_ID = assertValue(
	process.env.DISCORD_CLIENT_ID,
	'Missing environment variable: DISCORD_CLIENT_ID'
)

// ---------------------------------------------------------------------------
// AzerothCore SOAP (the bot's only AC connection after Stage 4)
// ---------------------------------------------------------------------------

export const SOAP_ENDPOINT = assertValue(
	process.env.SOAP_ENDPOINT,
	'Missing environment variable: SOAP_ENDPOINT'
)

export const SOAP_PORT = assertValue(
	process.env.SOAP_PORT,
	'Missing environment variable: SOAP_PORT'
)

export const SOAP_USER = assertValue(
	process.env.SOAP_USER,
	'Missing environment variable: SOAP_USER'
)

export const SOAP_PASSWORD = assertValue(
	process.env.SOAP_PASSWORD,
	'Missing environment variable: SOAP_PASSWORD'
)

// ---------------------------------------------------------------------------
// MySQL — bot-owned `azor_bot` database only (Stage 5+).
// ---------------------------------------------------------------------------
// Stage 4 (2026-05-13) removed every direct read against the `acore_*`
// databases; the bot now reaches AzerothCore exclusively through SOAP. These
// MYSQL_* vars are consumed only by `src/lib/botDb.ts` for the bot's own
// `azor_bot` schema (pending claim codes today, sender-side credits/cooldowns
// in Stage 6). The MYSQL user must have INSERT/DELETE on that database;
// read-only `acore_*` grants do NOT cover it.

export const MYSQL_ENDPOINT = assertValue(
	process.env.MYSQL_ENDPOINT,
	'Missing environment variable: MYSQL_ENDPOINT'
)

export const MYSQL_PORT = assertValue(
	process.env.MYSQL_PORT || 3306, // Default MySQL port
	'Missing environment variable: MYSQL_PORT'
)

export const MYSQL_USER = assertValue(
	process.env.MYSQL_USER,
	'Missing environment variable: MYSQL_USER'
)

export const MYSQL_PASSWORD = assertValue(
	process.env.MYSQL_PASSWORD,
	'Missing environment variable: MYSQL_PASSWORD'
)
