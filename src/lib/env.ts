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

export const DISCORD_TOKEN = assertValue(
	process.env.DISCORD_TOKEN,
	'Missing environment variable: DISCORD_TOKEN'
)

export const DISCORD_CLIENT_ID = assertValue(
	process.env.DISCORD_CLIENT_ID,
	'Missing environment variable: DISCORD_CLIENT_ID'
)

function assertValue<T>(v: T | undefined, errorMessage: string): T {
	if (v === undefined) {
		// throw new Error(errorMessage) // Always throws error
		console.error(errorMessage)
	}

	return v as T
}