/**
 * Minimal client for `mod-azor-api` over SOAP.
 *
 * Stage 3 surface: just `characterInteract` (needed to replace `/character gift`'s
 * direct `.additem` call). Stage 4 expands this with the read-path helpers
 * (`version`, `realm.*`, `character.{get,location,status,cooldown,history}`) and
 * deletes the legacy MySQL read path in one go — see `docs/PLAN.md` Stage 4.
 *
 * Transport: HTTP POST a SOAP `executeCommand` envelope at the worldserver's
 * SOAP endpoint, capture the `<result>` body, parse it as our JSON envelope.
 * No third-party SOAP library — same hand-rolled approach as
 * `executeSoapCommand.ts`. We keep both files until Stage 4 deletes the
 * legacy one.
 *
 * Encoding stack (innermost first):
 *   1. JSON literal (server returns this in `<result>`).
 *   2. AC chat-command argument quoting (`"..."`, escape `"` and `\`).
 *   3. XML entity escaping for the SOAP `<command>` body.
 */

import http from 'node:http'
import {
	AZOR_API_INTERACTION_TYPES,
	AZOR_API_SOURCE_TYPES,
	type AzorApiCharacterInteractData,
	type AzorApiEnvelope,
	type AzorApiInteractionType,
	type AzorApiSourceType,
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

export const azorApiClient = {
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
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

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
