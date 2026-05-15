/**
 * Environment at the edge.
 *
 * Per the monorepo rule, only apps read `process.env` — `@azor/shared` stays
 * pure. These are the SOAP connection details for `mod-azor-api`; they are
 * **server-only** secrets and must never be exposed with a `NEXT_PUBLIC_`
 * prefix. They are read lazily (not at module load) so a missing var fails the
 * first request, not the build.
 */

import type { SoapConfig } from '@azor/shared/client'

function required(name: string): string {
	const value = process.env[name]
	if (!value) throw new Error(`Missing required env var: ${name}`)
	return value
}

/** Build the `mod-azor-api` SOAP connection config from the environment. */
export function getSoapConfig(): SoapConfig {
	return {
		host: required('SOAP_ENDPOINT'),
		port: required('SOAP_PORT'),
		user: required('SOAP_USER'),
		password: required('SOAP_PASSWORD'),
	}
}
