/**
 * SOAP transport for `mod-azor-api`.
 *
 * The module is reached by HTTP POSTing a SOAP `executeCommand` envelope at
 * the worldserver's SOAP endpoint, capturing the `<result>` body, and parsing
 * it as our JSON envelope. No third-party SOAP library — a small hand-rolled
 * implementation is enough for the one verb we use.
 *
 * `buildSoapEnvelope` / `parseSoapEnvelope` are pure. `createHttpSoapTransport`
 * is the only side-effecting piece; it takes its config as an argument so this
 * module stays free of `process.env` (env lives at the consumer's edge).
 */

import type { AzorApiEnvelope } from '../index.js'
import { escapeXml } from './quoting.js'

/**
 * A transport sends a fully-formed SOAP envelope and returns the raw response
 * body. Consumers (the bot, the web API) supply one built from their own env.
 */
export type SoapTransport = (xmlBody: string) => Promise<string>

export interface SoapConfig {
	host: string
	/** Accepts string or number — env vars arrive as strings. */
	port: string | number
	user: string
	password: string
}

/** Wrap an `.azor api …` chat command in a SOAP `executeCommand` envelope. */
export function buildSoapEnvelope(command: string): string {
	return (
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
	)
}

/**
 * Parse a raw SOAP response body into our JSON envelope.
 *
 * SOAP-level failures (no envelope at all) are synthesized into a well-formed
 * `{ ok: false }` envelope so callers never have to special-case the transport.
 */
export function parseSoapEnvelope<T>(raw: string): AzorApiEnvelope<T> {
	const fault = raw.match(/<faultstring>([\s\S]*?)<\/faultstring>/)
	if (fault) {
		const message = fault[1].replace(/&#xD;/g, '').trim()
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

/**
 * Build an HTTP SOAP transport from connection config.
 *
 * Uses the global `fetch` (available in Bun, Node 18+, and the Next.js Node
 * runtime), so it works unchanged for both consumers. The endpoint is plain
 * HTTP — AzerothCore's SOAP listener does not do TLS; keep it on a trusted
 * network.
 */
export function createHttpSoapTransport(config: SoapConfig): SoapTransport {
	const url = `http://${config.host}:${config.port}/`
	const authorization = 'Basic ' + btoa(`${config.user}:${config.password}`)
	return async (xmlBody: string): Promise<string> => {
		const res = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/xml',
				Authorization: authorization,
			},
			body: xmlBody,
		})
		return res.text()
	}
}
