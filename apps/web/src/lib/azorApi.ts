/**
 * The web app's `mod-azor-api` client.
 *
 * Same shared, transport-agnostic client the Discord bot uses
 * (`@azor/shared/client`); this file is just the web app's edge — it wires the
 * HTTP SOAP transport to the env-derived connection config.
 *
 * IMPORTANT: this is **server-only**. The SOAP transport carries
 * `SEC_ADMINISTRATOR` credentials, so the client must never reach the browser.
 * Import it only from route handlers, server components, or server actions.
 * The browser talks to *our* API routes; our API routes talk to the module.
 *
 * The instance is created once per server process and memoised — the config is
 * static for the lifetime of the process.
 */

import 'server-only'

import { createAzorApiClient, createHttpSoapTransport, type AzorApiClient } from '@azor/shared/client'
import { getSoapConfig } from '@/lib/env'

let client: AzorApiClient | undefined

/** Lazily construct (and memoise) the shared `mod-azor-api` client. */
export function azorApi(): AzorApiClient {
	if (!client) {
		client = createAzorApiClient(createHttpSoapTransport(getSoapConfig()))
	}
	return client
}
