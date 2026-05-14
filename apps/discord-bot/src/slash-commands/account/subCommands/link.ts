import { randomBytes } from 'node:crypto'
import {
	ChatInputCommandInteraction,
	MessageFlags,
	type DiscordAPIError,
} from 'discord.js'
import { AZOR_API_ERROR_CODES, isAzorApiOk } from '@azor/shared'

import { azorApiClient } from '@azor/lib/azorApiClient'
import {
	insertPendingLink,
	reapExpiredPendingLinks,
} from '@azor/lib/botDb'

/**
 * `/account link`
 *
 * Issues a one-time 8-char hex code, registers it with the module's pending
 * table via `.azor api link begin`, mirrors it in the bot's own
 * `pending_account_links` table for UX/reaper, and DMs the user the in-game
 * command to run.
 *
 * Lazy reaper: runs at the top of every invocation to bound the bot's
 * pending table without a background worker. Same idea as the module-side
 * reaper inside `HandleApiLinkBegin`.
 *
 * The bot's pending row is INSERTed only after the module accepts `link begin`
 * — otherwise a transient module failure would leave the bot with an orphan
 * row that the operator-visible state doesn't reflect.
 */
export const link = {
	async execute(commandInteraction: ChatInputCommandInteraction) {
		const discordUserId = commandInteraction.user.id

		await commandInteraction.deferReply({ flags: MessageFlags.Ephemeral })

		// Tiny housekeeping — clear out stale rows we issued ourselves.
		try {
			await reapExpiredPendingLinks(Date.now())
		} catch (err) {
			console.error('[account link] reaper failed:', err)
			// Non-fatal — keep going. Bot DB might just be temporarily down.
		}

		// 8 hex chars = 32 bits. Collision probability is negligible at any
		// plausible volume; module's `link begin` returns invalid_arg on PK
		// collision and we'd reject below with a one-line note.
		const code = randomBytes(4).toString('hex')

		const env = await azorApiClient.linkBegin({
			code,
			source: 'discord',
			externalId: discordUserId,
		})

		if (!isAzorApiOk(env)) {
			await commandInteraction.editReply({
				content: friendlyLinkBeginError(env.error),
			})
			return
		}

		// Module accepted — mirror locally so we can list outstanding requests
		// and reap them on this side too.
		try {
			await insertPendingLink({
				code: env.data.code,
				discordUserId,
				expiresAt: env.data.expiresAt,
			})
		} catch (err) {
			// Bot-side mirror is best-effort. Module is authoritative; the code
			// is already valid for redemption.
			console.error('[account link] failed to mirror pending row:', err)
		}

		const inGameCommand = `.azor api link confirm ${env.data.code}`
		const ttlMinutes = Math.max(1, Math.round(env.data.ttlMs / 60_000))

		// Try DM first — the in-game command shouldn't be public.
		let dmDelivered = false
		try {
			await commandInteraction.user.send({
				content:
					`Your in-game link code is **\`${env.data.code}\`**.\n` +
					`While logged in to **any character** on your account, paste this into chat:\n` +
					`\`\`\`\n${inGameCommand}\n\`\`\`\n` +
					`The code expires in ~${ttlMinutes} minutes.`,
			})
			dmDelivered = true
		} catch (err) {
			// Common: DMs closed on this Discord server. Surface in the
			// ephemeral reply instead.
			if ((err as DiscordAPIError).code !== 50007) {
				console.error('[account link] DM failed:', err)
			}
		}

		if (dmDelivered) {
			await commandInteraction.editReply({
				content:
					`Check your DMs — I sent you a one-time code valid for ~${ttlMinutes} minutes.\n` +
					`Run the included \`.azor api link confirm …\` in-game to finish linking.`,
			})
		} else {
			// Fall back to ephemeral if DMs are closed. Still private to the user.
			await commandInteraction.editReply({
				content:
					`I couldn't DM you, so here's the code (only you can see this message):\n` +
					`While logged in to **any character**, paste this into chat:\n` +
					`\`\`\`\n${inGameCommand}\n\`\`\`\n` +
					`The code expires in ~${ttlMinutes} minutes.`,
			})
		}
	},
}

function friendlyLinkBeginError(error: { code: string; message: string }): string {
	switch (error.code) {
		case AZOR_API_ERROR_CODES.alreadyLinked:
			return (
				'Your Discord account is already linked to a WoW account. ' +
				'Use `/account whoami` to see the current binding.'
			)
		case AZOR_API_ERROR_CODES.disabled:
			return 'Account linking is currently disabled on the server.'
		case AZOR_API_ERROR_CODES.invalidArg:
			// Includes the rare code-collision retry path.
			return `Could not start linking: ${error.message}. Please try again.`
		default:
			return `Could not start linking (${error.code}): ${error.message}.`
	}
}
