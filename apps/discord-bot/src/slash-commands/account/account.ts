import { ChatInputCommandInteraction } from 'discord.js'

import { Command } from '@azor/command'
import { commandData } from '@azor.slash-commands/account/commandData'
import { link } from '@azor.slash-commands/account/subCommands/link'
import { whoami } from '@azor.slash-commands/account/subCommands/whoami'

export const account: Command = {
	cmdData: commandData,
	async execute(commandInteraction: ChatInputCommandInteraction) {
		switch (commandInteraction.options.getSubcommand()) {
			case 'link':
				link.execute(commandInteraction)
				break
			case 'whoami':
				whoami.execute(commandInteraction)
				break
			default:
				commandInteraction.reply({ content: 'No command found!', ephemeral: true })
				break
		}
	},
}
