import { assertValue } from "@azor.lib/assertValue";

const dotenv = require('dotenv');
dotenv.config()

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

export const DISCORD_TOKEN = assertValue(
	process.env.DISCORD_TOKEN,
	'Missing environment variable: DISCORD_TOKEN'
)

export const DISCORD_CLIENT_ID = assertValue(
	process.env.DISCORD_CLIENT_ID,
	'Missing environment variable: DISCORD_CLIENT_ID'
)
