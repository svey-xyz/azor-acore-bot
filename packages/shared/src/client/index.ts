/**
 * `@azor/shared/client` — the transport-agnostic `mod-azor-api` client.
 *
 * Consumed by `apps/discord-bot` (Discord) and `apps/web` (the Next.js API).
 * The contract types themselves live one level up in `@azor/shared`; this
 * subpath is the *client* surface — pull it in only where you actually call
 * the module.
 */

export { quoteForChat, escapeXml } from './quoting.js'
export {
	buildSoapEnvelope,
	parseSoapEnvelope,
	createHttpSoapTransport,
	type SoapTransport,
	type SoapConfig,
} from './soap.js'
export {
	createAzorApiClient,
	type AzorApiClient,
	type CharacterInteractArgs,
	type LinkBeginArgs,
	type LinkStatusArgs,
	type RealmOnlineArgs,
	type CharacterCooldownArgs,
	type CharacterHistoryArgs,
} from './azorApiClient.js'
