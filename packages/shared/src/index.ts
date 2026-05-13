/**
 * @azor/shared
 *
 * Contracts shared between the Discord bot and the AzerothCore `mod-azor-api`
 * C++ module. Anything here MUST be kept in lockstep with the module's
 * `packages/server-module/src/AzorApi.h` — there is no automatic drift
 * detection (see PLAN.md open decisions).
 *
 * Runtime resolution: `package.json` `exports` points at this `.ts` source so
 * Bun (Dockerfile + workspace consumers) resolves it without a build step.
 * If you ever publish or consume from a runtime that won't transpile TS, run
 * `bun --cwd packages/shared run build` and repoint `exports` at `dist/`.
 */

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------

/**
 * Bumped whenever the `.azor api` JSON contract changes in a
 * backwards-incompatible way. Clients should compare against this on connect
 * and refuse to operate on mismatch.
 *
 * MUST equal `AzorApi::SCHEMA_VERSION` in the C++ module.
 */
export const AZOR_API_SCHEMA = 'v1' as const

export type AzorApiSchemaVersion = typeof AZOR_API_SCHEMA

// ---------------------------------------------------------------------------
// Source types (who is invoking an interaction)
// ---------------------------------------------------------------------------

export const AZOR_API_SOURCE_TYPES = ['discord', 'website', 'admin', 'system'] as const
export type AzorApiSourceType = (typeof AZOR_API_SOURCE_TYPES)[number]

// ---------------------------------------------------------------------------
// Interaction types (the `type` arg of `character interact`)
// ---------------------------------------------------------------------------
//
// Extensible enum: Stage 3 ships `gift`. New entries don't require a schema
// version bump — clients that don't know about a new type just won't call it.

export const AZOR_API_INTERACTION_TYPES = ['gift'] as const
export type AzorApiInteractionType = (typeof AZOR_API_INTERACTION_TYPES)[number]

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------
//
// Stable strings. Clients switch on `code`, never on `message`. MUST equal
// the strings under `AzorApi::ErrorCodes` in the C++ module.

export const AZOR_API_ERROR_CODES = {
	notFound: 'not_found',
	invalidArg: 'invalid_arg',
	internal: 'internal',
	unimplemented: 'unimplemented',
	disabled: 'disabled',
} as const

export type AzorApiErrorCode = (typeof AZOR_API_ERROR_CODES)[keyof typeof AZOR_API_ERROR_CODES]

export interface AzorApiError {
	code: AzorApiErrorCode
	message: string
}

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------
//
// Every API response is one of these two shapes:
//   { ok: true,  data: <payload> }
//   { ok: false, error: { code, message } }

export type AzorApiEnvelope<T> =
	| { ok: true; data: T }
	| { ok: false; error: AzorApiError }

// ---------------------------------------------------------------------------
// Response payload types — Stage 2 read endpoints
// ---------------------------------------------------------------------------

export interface AzorApiVersionData {
	schema: AzorApiSchemaVersion
	build: string
}

export interface AzorApiRealmPopulationData {
	online: number
}

export interface AzorApiCharacterSnapshot {
	guid: number
	name: string
	race: number
	class: number
	gender: number
	level: number
	zoneId: number
	mapId: number
	accountId: number
	online: boolean
}

export interface AzorApiRealmOnlineData {
	total: number
	limit: number
	offset: number
	characters: AzorApiCharacterSnapshot[]
}

export interface AzorApiCharacterLocationData {
	zoneId: number
	mapId: number
	online: boolean
}

export interface AzorApiCharacterStatusData {
	online: boolean
	level: number
}

// ---------------------------------------------------------------------------
// Type-narrowing helpers
// ---------------------------------------------------------------------------

export const isAzorApiOk = <T>(
	env: AzorApiEnvelope<T>
): env is { ok: true; data: T } => env.ok === true

export const isAzorApiErr = <T>(
	env: AzorApiEnvelope<T>
): env is { ok: false; error: AzorApiError } => env.ok === false
