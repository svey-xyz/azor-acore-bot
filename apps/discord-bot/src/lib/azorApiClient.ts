/**
 * The bot's `mod-azor-api` client.
 *
 * After the Stage 4 migration this is the bot's ONLY transport for
 * AzerothCore data — `acore_characters` / `acore_world` / `acore_auth` are
 * strictly the module's territory (the bot still owns `azor_bot` via
 * `botDb.ts`).
 *
 * The client itself is transport-agnostic and lives in `@azor/shared/client`
 * so the Discord bot and the web API share one implementation. This file is
 * just the bot's edge: it reads SOAP connection details from the environment
 * and wires up the HTTP transport.
 */

import { createAzorApiClient, createHttpSoapTransport } from '@azor/shared/client'
import { SOAP_ENDPOINT, SOAP_PASSWORD, SOAP_PORT, SOAP_USER } from '@azor.lib/conf.env'

export const azorApiClient = createAzorApiClient(
	createHttpSoapTransport({
		host: SOAP_ENDPOINT,
		port: SOAP_PORT,
		user: SOAP_USER,
		password: SOAP_PASSWORD,
	}),
)

// Re-exported so existing call sites can keep importing argument types from
// `@azor/lib/azorApiClient` — the shapes now live in `@azor/shared/client`.
export type {
	AzorApiClient,
	CharacterInteractArgs,
	LinkBeginArgs,
	LinkStatusArgs,
	RealmOnlineArgs,
	CharacterCooldownArgs,
	CharacterHistoryArgs,
} from '@azor/shared/client'
