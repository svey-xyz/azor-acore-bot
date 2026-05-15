/**
 * Transport-agnostic client for `mod-azor-api`.
 *
 * `createAzorApiClient(transport)` returns the typed method surface; the
 * `transport` argument decides *how* the SOAP envelope is delivered. Both
 * consumers in this monorepo use `createHttpSoapTransport` (see `./soap`), but
 * the seam exists so a future HTTP transport (PLAN.md Stage 7) can drop in
 * without touching this file.
 *
 * Every method returns the parsed `AzorApiEnvelope` as-is — callers narrow
 * with `isAzorApiOk` / `isAzorApiErr` from `@azor/shared`.
 */

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
} from '../index.js'
import { quoteForChat } from './quoting.js'
import { buildSoapEnvelope, parseSoapEnvelope, type SoapTransport } from './soap.js'

// ---------------------------------------------------------------------------
// Argument shapes
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

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** The typed method surface returned by `createAzorApiClient`. */
export type AzorApiClient = ReturnType<typeof createAzorApiClient>

export function createAzorApiClient(transport: SoapTransport) {
	async function exec<T>(command: string): Promise<AzorApiEnvelope<T>> {
		const raw = await transport(buildSoapEnvelope(command))
		return parseSoapEnvelope<T>(raw)
	}

	return {
		// -------- Stage 2: read endpoints --------------------------------------

		/** `.azor api version` — `{ schema, build }`. Cheap; suitable for compat checks. */
		version(): Promise<AzorApiEnvelope<AzorApiVersionData>> {
			return exec<AzorApiVersionData>('.azor api version')
		},

		/** `.azor api realm population` — total online characters. */
		realmPopulation(): Promise<AzorApiEnvelope<AzorApiRealmPopulationData>> {
			return exec<AzorApiRealmPopulationData>('.azor api realm population')
		},

		/**
		 * `.azor api realm online [limit] [offset]` — paginated online characters.
		 * Server clamps `limit`. Both args are optional.
		 */
		realmOnline(args: RealmOnlineArgs = {}): Promise<AzorApiEnvelope<AzorApiRealmOnlineData>> {
			const positional: string[] = []
			if (args.limit !== undefined) {
				assertNonNegativeInt(args.limit, 'limit')
				positional.push(String(args.limit))
				if (args.offset !== undefined) {
					assertNonNegativeInt(args.offset, 'offset')
					positional.push(String(args.offset))
				}
			} else if (args.offset !== undefined) {
				// `offset` without `limit` is meaningless to the positional parser.
				throw new Error('azorApiClient.realmOnline: offset requires limit')
			}
			const command = `.azor api realm online${positional.length ? ' ' + positional.join(' ') : ''}`
			return exec<AzorApiRealmOnlineData>(command)
		},

		/** `.azor api character get <name>` — full snapshot. */
		characterGet(name: string): Promise<AzorApiEnvelope<AzorApiCharacterSnapshot>> {
			return exec<AzorApiCharacterSnapshot>(`.azor api character get ${quoteForChat(name)}`)
		},

		/** `.azor api character location <name>` — `{ zoneId, mapId, online }`. */
		characterLocation(name: string): Promise<AzorApiEnvelope<AzorApiCharacterLocationData>> {
			return exec<AzorApiCharacterLocationData>(
				`.azor api character location ${quoteForChat(name)}`,
			)
		},

		/** `.azor api character status <name>` — `{ online, level }`. */
		characterStatus(name: string): Promise<AzorApiEnvelope<AzorApiCharacterStatusData>> {
			return exec<AzorApiCharacterStatusData>(
				`.azor api character status ${quoteForChat(name)}`,
			)
		},

		// -------- Stage 3: interaction primitives ------------------------------

		/**
		 * `.azor api character interact <name> <type> <source_type> <source_id> [json_payload]`
		 *
		 * The module enforces cooldown / min_level / character_exists server-side
		 * and surfaces those as structured `error.code` values.
		 */
		characterInteract(
			args: CharacterInteractArgs,
		): Promise<AzorApiEnvelope<AzorApiCharacterInteractData>> {
			// Defensive client-side validation. The server validates again — this
			// just fails faster on obvious bugs with a clearer stack trace.
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

			return exec<AzorApiCharacterInteractData>(
				`.azor api character interact ${positional.join(' ')}`,
			)
		},

		/**
		 * `.azor api character cooldown <name> <type>` — remaining ms for a single
		 * (character, type) pair. Returns `0` when no cooldown is active.
		 */
		characterCooldown(
			args: CharacterCooldownArgs,
		): Promise<AzorApiEnvelope<AzorApiCharacterCooldownData>> {
			if (!AZOR_API_INTERACTION_TYPES.includes(args.type))
				throw new Error(`azorApiClient: unknown interaction type '${args.type}'`)
			return exec<AzorApiCharacterCooldownData>(
				`.azor api character cooldown ${quoteForChat(args.name)} ${args.type}`,
			)
		},

		/**
		 * `.azor api character history <name> [type|all] [limit]` — audit log,
		 * newest-first. Server clamps `limit` to the module's max-limit knob.
		 */
		characterHistory(
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
			return exec<AzorApiCharacterHistoryData>(
				`.azor api character history ${positional.join(' ')}`,
			)
		},

		// -------- Stage 5: account linking -------------------------------------

		/**
		 * `.azor api link begin <code> <source> <external_id>`
		 *
		 * Registers a pending claim code on the module. The user then runs
		 * `.azor api link confirm <code>` in-game to bind their account.
		 * Errors surfaced as `error.code`: invalid_arg, already_linked, internal.
		 */
		linkBegin(args: LinkBeginArgs): Promise<AzorApiEnvelope<AzorApiLinkBeginData>> {
			if (!AZOR_API_LINK_SOURCES.includes(args.source))
				throw new Error(`azorApiClient: unknown link source '${args.source}'`)
			if (!/^[0-9a-f]{8}$/.test(args.code))
				throw new Error('azorApiClient: code must be exactly 8 lowercase hex chars')
			return exec<AzorApiLinkBeginData>(
				`.azor api link begin ${args.code} ${args.source} ${quoteForChat(args.externalId)}`,
			)
		},

		/**
		 * `.azor api link status <source> <external_id>`
		 *
		 * Reverse lookup. Always returns `ok` (linked=false when nothing is bound);
		 * structured errors are reserved for validation failures.
		 */
		linkStatus(args: LinkStatusArgs): Promise<AzorApiEnvelope<AzorApiLinkStatusData>> {
			if (!AZOR_API_LINK_SOURCES.includes(args.source))
				throw new Error(`azorApiClient: unknown link source '${args.source}'`)
			return exec<AzorApiLinkStatusData>(
				`.azor api link status ${args.source} ${quoteForChat(args.externalId)}`,
			)
		},

		// Note: `link confirm` is intentionally not exposed. The module marks that
		// handler `Console::No` / `SEC_PLAYER` — only an in-game player can invoke
		// it (the session's account_id is the trust root). SOAP can't call it.
	}
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function assertNonNegativeInt(n: number, label: string): void {
	if (!Number.isInteger(n) || n < 0)
		throw new Error(`azorApiClient: ${label} must be a non-negative integer`)
}
