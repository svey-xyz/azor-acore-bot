/**
 * Encoding helpers for the `.azor api` chat-command transport.
 *
 * Encoding stack (innermost first):
 *   1. JSON literal — the module returns this in `<result>`.
 *   2. AC chat-command argument quoting (`"..."`, escape `"` and `\`).
 *   3. XML entity escaping for the SOAP `<command>` body.
 *
 * Pure — no I/O, no env. Shared by every transport.
 */

/**
 * Wrap a value as an AzerothCore chat-command argument. We always quote so
 * embedded spaces and special characters survive the parser; the wrapper
 * escapes the two characters that would otherwise break the quoted form.
 */
export function quoteForChat(value: string): string {
	return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** Escape a string for inclusion in an XML text node / SOAP `<command>` body. */
export function escapeXml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;')
}
