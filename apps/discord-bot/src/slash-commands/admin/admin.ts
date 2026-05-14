import { ChatInputCommandInteraction } from 'discord.js'

import { Command } from '@azor/command'
import { adminOnly } from '@azor/permissions/commandPermissions'
import { commandData } from '@azor.slash-commands/admin/commandData'
import { grantCredits } from '@azor.slash-commands/admin/subCommands/grantCredits'

/**
 * `/admin` — operator-only bot administration.
 *
 * `adminOnly` is the authoritative gate: it checks the caller's Discord
 * Administrator permission and replies with a rejection itself if the check
 * fails, so this handler just bails on `false`. (`commandData` also sets
 * `setDefaultMemberPermissions(0)` to hide the command client-side, but that's
 * cosmetic — never trust it alone.)
 */
export const admin: Command = {
	cmdData: commandData,
	async execute(commandInteraction: ChatInputCommandInteraction) {
		if (!adminOnly(commandInteraction)) return

		switch (commandInteraction.options.getSubcommand()) {
			case 'grant-credits':
				grantCredits.execute(commandInteraction)
				break
			default:
				commandInteraction.reply({ content: 'No command found!', ephemeral: true })
				break
		}
	},
}
