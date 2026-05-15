/**
 * Turn an `AzorApiEnvelope` into an HTTP response.
 *
 * The JSON body is the envelope verbatim — clients switch on `ok` / `error.code`
 * exactly as the Discord bot does. The HTTP status is a courtesy mapping on top
 * so plain `fetch` callers and proxies see a sensible code.
 */

import { isAzorApiErr, type AzorApiEnvelope, type AzorApiErrorCode } from '@azor/shared'

const STATUS_BY_CODE: Record<AzorApiErrorCode, number> = {
	not_found: 404,
	invalid_arg: 400,
	unauthorized: 401,
	cooldown: 409,
	min_level: 409,
	expired: 409,
	already_linked: 409,
	disabled: 503,
	unimplemented: 501,
	// The module is upstream of us — its internal failures read as a bad gateway.
	internal: 502,
}

/** Serialize an envelope to a `Response`, mapping `error.code` to an HTTP status. */
export function respond<T>(env: AzorApiEnvelope<T>): Response {
	const status = isAzorApiErr(env) ? (STATUS_BY_CODE[env.error.code] ?? 502) : 200
	return Response.json(env, { status })
}

/**
 * Run a client call and serialize the result. The shared client throws on
 * obvious client-side argument bugs (e.g. an unknown interaction type); those
 * are caught here and surfaced as a well-formed error envelope rather than an
 * unhandled 500 with a stack trace.
 */
export async function handle<T>(call: () => Promise<AzorApiEnvelope<T>>): Promise<Response> {
	try {
		return respond(await call())
	} catch (err) {
		return Response.json(
			{ ok: false, error: { code: 'internal', message: (err as Error).message } },
			{ status: 500 },
		)
	}
}
