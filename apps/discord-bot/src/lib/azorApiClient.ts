/**
 * Client for `mod-azor-api` over SOAP.
 *
 * After Stage 4 this is the bot's ONLY transport for AzerothCore data:
 *   - reads:  version, realm.*, character.{get,location,status,cooldown,history}
 *   - writes: character.interact
 *   - link:   link.{begin,status}
 *
 * The bot still owns `azor_bot` (its own MySQL DB) via `botDb.ts`, but
 * `acore_characters` / `acore_world` / `acore_auth` are now strictly the
 * module's territory.
 *
 * Transport: HTTP POST a SOAP `executeCommand` envelope at the worldserver's
 * SOAP endpoint, capture the `<result>` body, parse it as our JSON envelope.
 * No third-party SOAP library — small hand-rolled implementation.
 *
 * Encoding stack (innermost first):
 *   1. JSON literal (server returns this in `<result>`).
 *   2. AC chat-command argument quoting (`"..."`, escape `"` and `\`).
 *   3. XML entity escaping for the SOAP `<command>` body.
 */

import http from 'node:http'
import {
	AZOR_API_INTERACTION_TYPES,
	AZOR_API_LINK_SOURCES,
	AZOR_API_SOURCE_TYPES,
	type AzorApiCharacterCooldownData,
	type AzorApiCharacterHistoryData,
	type AzorApiCharacterInteractData,
	type AzorApiCharacterLocationData,
	type AzorApiCharacterSnapshot,
	type AzorApiCharacterStatusData,
	type AzorApiEnvelope,
	type AzorApiInteractionType,
	type AzorApiLinkBeginData,
	type AzorApiLinkSource,
	type AzorApiLinkStatusData,
	type AzorApiRealmOnlineData,
	type AzorApiRealmPopulationData,
	type AzorApiSourceType,
	type AzorApiVersionData,
} from '@azor/shared'
import { SOAP_ENDPOINT, SOAP_PASSWORD, SOAP_PORT, SOAP_USER } from '@azor.lib/conf.env'

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface CharacterInteractArgs {
	name: string
	type: AzorApiInteractionType
	sourceType: AzorApiSourceType
	sourceId: string
	/** Optional structured payload; serialized to JSON and stored in `payload_json`. */
	payload?: Record<string, unknown> | undefined
}

export interface LinkBeginArgs {
	/** 8-char lowercase hex code (caller generates; module validates shape). */
	code: string
	source: AzorApiLinkSource
	externalId: string
}

export interface LinkStatusArgs {
	source: AzorApiLinkSource
	externalId: string
}

export interface RealmOnlineArgs {
	/** Server clamps to its `interactions.history.max_limit` knob; omit for default. */
	limit?: number
	offset?: number
}

export interface CharacterCooldownArgs {
	name: string
	type: AzorApiInteractionType
}

export interface CharacterHistoryArgs {
	name: string
	/** Omit (or 'all') for unfiltered history; module accepts both forms. */
	type?: AzorApiInteractionType | 'all'
	limit?: number
}

export const azorApiClient = {
	// -------- Stage 2: read endpoints ----------------------------------------

	/**
	 * `.azor api version` — `{ schema, build }`. Cheap; suitable for
	 * startup compatibility checks.
	 */
	async version(): Promise<AzorApiEnvelope<AzorApiVersionData>> {
		return executeAzorApiCommand<AzorApiVersionData>('.azor api version')
	},

	/** `.azor api realm population` — total online characters. */
	async realmPopulation(): Promise<AzorApiEnvelope<AzorApiRealmPopulationData>> {
		return executeAzorApiCommand<AzorApiRealmPopulationData>('.azor api realm population')
	},

	/**
	 * `.azor api realm online [limit] [offset]` — paginated online characters.
	 * Server clamps `limit`. Both args are optional.
	 */
	async realmOnline(
		args: RealmOnlineArgs = {},
	): Promise<AzorApiEnvelope<AzorApiRealmOnlineData>> {
		const positional: string[] = []
		if (args.limit !== undefined) {
			assertNonNegativeInt(args.limit, 'limit')
			positional.push(String(args.limit))
			if (args.offset !== undefined) {
				assertNonNegativeInt(args.offset, 'offset')
				positional.push(String(args.offset))
			}
		} else if (args.offset !== undefined) {
			// `offset` without `limit` is meaningless to the chat-command parser
			// (positional). Catch the misuse early.
			throw new Error('azorApiClient.realmOnline: offset requires limit')
		}
		const command = `.azor api realm online${positional.length ? ' ' + positional.join(' ') : ''}`
		return executeAzorApiCommand<AzorApiRealmOnlineData>(command)
	},

	/** `.azor api character get <name>` — full snapshot. */
	async characterGet(name: string): Promise<AzorApiEnvelope<AzorApiCharacterSnapshot>> {
		return executeAzorApiCommand<AzorApiCharacterSnapshot>(
			`.azor api character get ${quoteForChat(name)}`,
		)
	},

	/** `.azor api character location <name>` — `{ zoneId, mapId, online }`. */
	async characterLocation(
		name: string,
	): Promise<AzorApiEnvelope<AzorApiCharacterLocationData>> {
		return executeAzorApiCommand<AzorApiCharacterLocationData>(
			`.azor api character location ${quoteForChat(name)}`,
		)
	},

	/** `.azor api character status <name>` — `{ online, level }`. */
	async characterStatus(
		name: string,
	): Promise<AzorApiEnvelope<AzorApiCharacterStatusData>> {
		return executeAzorApiCommand<AzorApiCharacterStatusData>(
			`.azor api character status ${quoteForChat(name)}`,
		)
	},

	// -------- Stage 3: interaction primitives --------------------------------

	/**
	 * `.azor api character interact <name> <type> <source_type> <source_id> [json_payload]`
	 *
	 * Returns the parsed envelope as-is so callers narrow with `isAzorApiOk` /
	 * `isAzorApiErr`. The module enforces cooldown/min_level/character_exists
	 * server-side and surfaces those as structured `error.code` values.
	 */
	async characterInteract(
		args: CharacterInteractArgs,
	): Promise<AzorApiEnvelope<AzorApiCharacterInteractData>> {
		// Defensive client-side validation. Server validates again — this just
		// fails faster on obvious bugs and gives a clearer stack trace.
		if (!AZOR_API_INTERACTION_TYPES.includes(args.type))
			throw new Error(`azorApiClient: unknown interaction type '${args.type}'`)
		if (!AZOR_API_SOURCE_TYPES.includes(args.sourceType))
			throw new Error(`azorApiClient: unknown source type '${args.sourceType}'`)

		const positional = [
			quoteForChat(args.name),
			args.type,
			args.sourceType,
			quoteForChat(args.sourceId),
		]
		if (args.payload !== undefined) {
			positional.push(quoteForChat(JSON.stringify(args.payload)))
		}

		const command = `.azor api character interact ${positional.join(' ')}`
		return executeAzorApiCommand<AzorApiCharacterInteractData>(command)
	},

	/**
	 * `.azor api character cooldown <name> <type>` — remaining ms for a single
	 * (character, type) pair. Returns `0` when no cooldown is active.
	 * Bot-internal admin helper.
	 */
	async characterCooldown(
		args: CharacterCooldownArgs,
	): Promise<AzorApiEnvelope<AzorApiCharacterCooldownData>> {
		if (!AZOR_API_INTERACTION_TYPES.includes(args.type))
			throw new Error(`azorApiClient: unknown interaction type '${args.type}'`)
		return executeAzorApiCommand<AzorApiCharacterCooldownData>(
			`.azor api character cooldown ${quoteForChat(args.name)} ${args.type}`,
		)
	},

	/**
	 * `.azor api character history <name> [type|all] [limit]` — audit log,
	 * newest-first. Server clamps `limit` to the module's max-limit knob.
	 * Bot-internal admin helper.
	 */
	async characterHistory(
		args: CharacterHistoryArgs,
	): Promise<AzorApiEnvelope<AzorApiCharacterHistoryData>> {
		const positional: string[] = [quoteForChat(args.name)]
		if (args.type !== undefined) {
			if (args.type !== 'all' && !AZOR_API_INTERACTION_TYPES.includes(args.type))
				throw new Error(`azorApiClient: unknown interaction type '${args.type}'`)
			positional.push(args.type)
			if (args.limit !== undefined) {
				assertNonNegativeInt(args.limit, 'limit')
				positional.push(String(args.limit))
			}
		} else if (args.limit !== undefined) {
			throw new Error('azorApiClient.characterHistory: limit requires type')
		}
		return executeAzorApiCommand<AzorApiCharacterHistoryData>(
			`.azor api character history ${positional.join(' ')}`,
		)
	},

	// -------- Stage 5: account linking ---------------------------------------

	/**
	 * `.azor api link begin <code> <source> <external_id>`
	 *
	 * Registers a pending claim code on the module. The user then runs
	 * `.azor api link confirm <code>` in-game to bind their account.
	 *
	 * Errors surfaced as `error.code`: invalid_arg, already_linked, internal.
	 */
	async linkBegin(args: LinkBeginArgs): Promise<AzorApiEnvelope<AzorApiLinkBeginData>> {
		if (!AZOR_API_LINK_SOURCES.includes(args.source))
			throw new Error(`azorApiClient: unknown link source '${args.source}'`)
		if (!/^[0-9a-f]{8}$/.test(args.code))
			throw new Error(`azorApiClient: code must be exactly 8 lowercase hex chars`)

		const command =
			`.azor api link begin ${args.code} ${args.source} ${quoteForChat(args.externalId)}`
		return executeAzorApiCommand<AzorApiLinkBeginData>(command)
	},

	/**
	 * `.azor api link status <source> <external_id>`
	 *
	 * Reverse lookup. Always returns `ok` (linked=false when nothing is bound);
	 * structured errors are reserved for validation failures.
	 */
	async linkStatus(args: LinkStatusArgs): Promise<AzorApiEnvelope<AzorApiLinkStatusData>> {
		if (!AZOR_API_LINK_SOURCES.includes(args.source))
			throw new Error(`azorApiClient: unknown link source '${args.source}'`)

		const command =
			`.azor api link status ${args.source} ${quoteForChat(args.externalId)}`
		return executeAzorApiCommand<AzorApiLinkStatusData>(command)
	},

	// Note: `link confirm` is intentionally not exposed here. The module marks
	// that handler `Console::No` / `SEC_PLAYER` — only an in-game player can
	// invoke it (the session's account_id is the trust root). SOAP can't call
	// it, so the bot can't either.
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function assertNonNegativeInt(n: number, label: string): void {
	if (!Number.isInteger(n) || n < 0)
		throw new Error(`azorApiClient: ${label} must be a non-negative integer`)
}

/**
 * Wrap a value as an AC chat-command argument. We always quote so embedded
 * spaces and special characters survive the parser; the wrapper escapes the
 * two characters that would otherwise break the quoted form.
 */
function quoteForChat(value: string): string {
	return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function escapeXml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;')
}

async function executeAzorApiCommand<T>(command: string): Promise<AzorApiEnvelope<T>> {
	const xmlBody =
		'<SOAP-ENV:Envelope' +
		' xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"' +
		' xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/"' +
		' xmlns:xsi="http://www.w3.org/1999/XMLSchema-instance"' +
		' xmlns:xsd="http://www.w3.org/1999/XMLSchema"' +
		' xmlns:ns1="urn:AC">' +
		'<SOAP-ENV:Body>' +
		'<ns1:executeCommand>' +
		`<command>${escapeXml(command)}</command>` +
		'</ns1:executeCommand>' +
		'</SOAP-ENV:Body>' +
		'</SOAP-ENV:Envelope>'

	const raw = await new Promise<string>((resolve, reject) => {
		const req = http.request(
			{
				host: SOAP_ENDPOINT,
				port: SOAP_PORT,
				method: 'POST',
				auth: `${SOAP_USER}:${SOAP_PASSWORD}`,
				headers: { 'Content-Type': 'application/xml' },
			},
			(res) => {
				let buf = ''
				res.setEncoding('utf8')
				res.on('data', (chunk: string) => {
					buf += chunk
				})
				res.on('end', () => resolve(buf))
				res.on('error', reject)
			},
		)
		req.on('error', reject)
		req.write(xmlBody)
		req.end()
	})

	const fault = raw.match(/<faultstring>([\s\S]*?)<\/faultstring>/)
	if (fault) {
		const message = fault[1].replace(/&#xD;/g, '').trim()
		// SOAP-level failures look like envelope-less errors. Synthesize a
		// well-formed envelope so callers don't have to special-case this path.
		return { ok: false, error: { code: 'internal', message: `SOAP fault: ${message}` } }
	}

	const result = raw.match(/<result>([\s\S]*?)<\/result>/)
	if (!result) {
		return { ok: false, error: { code: 'internal', message: 'no <result> in SOAP response' } }
	}

	const text = result[1].replace(/&#xD;/g, '').trim()
	try {
		return JSON.parse(text) as AzorApiEnvelope<T>
	} catch (err) {
		return {
			ok: false,
			error: {
				code: 'internal',
				message: `failed to parse module response as JSON: ${(err as Error).message}`,
			},
		}
	}
}
