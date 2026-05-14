import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'

import { grantGiftCredits } from '@azor/lib/botDb'

/**
 * `/admin grant-credits <user> <amount>`
 *
 * Operator top-up (or deduction) of a user's `gift_credits`. `amount` may be
 * negative to claw credits back; `grantGiftCredits` floors the balance at 0 so
 * a deduction can never put a user in debt. The row is created lazily if the
 * user has no policy state yet.
 *
 * Role-gating happens upstream in `admin.ts` via `adminOnly` — this handler
 * assumes the caller is already authorised.
 */
export const grantCredits = {
	async execute(commandInteraction: ChatInputCommandInteraction) {
		const user = commandInteraction.options.getUser('user', true)
		const amount = commandInteraction.options.getInteger('amount', true)

		if (user.bot) {
			await commandInteraction.reply({
				content: 'Bots cannot hold gift credits.',
				flags: MessageFlags.Ephemeral,
			})
			return
		}
		if (amount === 0) {
			await commandInteraction.reply({
				content: 'Amount must be a non-zero integer.',
				flags: MessageFlags.Ephemeral,
			})
			return
		}

		await commandInteraction.deferReply({ flags: MessageFlags.Ephemeral })

		try {
			const balance = await grantGiftCredits(user.id, amount)
			const verb = amount > 0 ? `Granted **${amount}**` : `Deducted **${Math.abs(amount)}**`
			const preposition = amount > 0 ? 'to' : 'from'
			await commandInteraction.editReply({
				content: `${verb} gift credit(s) ${preposition} <@${user.id}>. New balance: **${balance}**.`,
			})
		} catch (err) {
			console.error('[admin grant-credits] failed:', err)
			await commandInteraction.editReply({
				content: 'Failed to update credits — the bot database may be unavailable.',
			})
		}
	},
}
