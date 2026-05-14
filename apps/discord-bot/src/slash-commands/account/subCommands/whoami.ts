import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'
import { isAzorApiOk } from '@azor/shared'

import { azorApiClient } from '@azor/lib/azorApiClient'

/**
 * `/account whoami`
 *
 * Asks the module whether this Discord user has a confirmed link, and if so
 * which AzerothCore `account.id` they're bound to.
 *
 * Always replies — the module returns `linked: false` rather than an error
 * when nothing is bound. Errors only fire on validation / disabled / internal.
 */
export const whoami = {
	async execute(commandInteraction: ChatInputCommandInteraction) {
		await commandInteraction.deferReply({ flags: MessageFlags.Ephemeral })

		const env = await azorApiClient.linkStatus({
			source: 'discord',
			externalId: commandInteraction.user.id,
		})

		if (!isAzorApiOk(env)) {
			await commandInteraction.editReply({
				content: `Could not look up link status (${env.error.code}): ${env.error.message}.`,
			})
			return
		}

		if (!env.data.linked) {
			await commandInteraction.editReply({
				content:
					"Your Discord account isn't linked to a WoW account yet. " +
					'Run `/account link` to start.',
			})
			return
		}

		// `linked === true` ⇒ accountId and linkedAt are non-null.
		const when = env.data.linkedAt
			? `<t:${Math.floor(env.data.linkedAt / 1000)}:R>`
			: 'an unknown time ago'

		await commandInteraction.editReply({
			content:
				`You're linked to WoW account id \`${env.data.accountId}\` ` +
				`(${when}).`,
		})
	},
}
