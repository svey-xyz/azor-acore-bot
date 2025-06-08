import { ApplicationCommandSubCommandData, ChatInputCommandInteraction, CommandInteraction, Interaction, MessageComponentInteraction } from "discord.js";

import { Command } from "@azor/command";
import { commandData } from "@azor.slash-commands/realm/commandData"
import { online } from "@azor.slash-commands/realm/subCommands/online";
import { pop } from "@azor.slash-commands/realm/subCommands/pop";

export const realm = {
	cmdData: commandData,
	async execute(commandInteraction: ChatInputCommandInteraction) {
		// console.log('Realm command executed', commandInteraction);
		switch ('dasdasd' as any) {
			case ('status'):
				// status.execute(commandInteraction);
				break;
			case ('characters'):
				// characters.execute(commandInteraction)
				break;
			case ('online'):
				online.execute(commandInteraction)
				break;
			case ('pop'):
				pop.execute(commandInteraction)
				break;
			default:
				commandInteraction.reply({ content: `No command found!` })
				break;
		}
	},
};