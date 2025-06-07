import { CommandInteraction } from "discord.js";

import { Command } from "@azor/command";
import { commandData } from "@azor.slash-commands/character/commandData"
import { status } from "@azor.slash-commands/character/subCommands/status";
import { info } from "@azor.slash-commands/character/subCommands/info";
import { location } from "@azor.slash-commands/character/subCommands/location";
import { gift } from "@azor.slash-commands/character/subCommands/gift";	


export const character: Command = {
	cmdData: commandData,
	async execute(commandInteraction: CommandInteraction) {
		switch (commandInteraction.options.getSubcommand()) {
			case ('status'):
				status.execute(commandInteraction);
				break;
			case ('info'):
				info.execute(commandInteraction)
				break;
			case ('location'):
				location.execute(commandInteraction)
				break;
			case ('gift'):
				gift.execute(commandInteraction)
				break;
			default:
				commandInteraction.reply({ content: `No command found!`, ephemeral: true })
				break;
		}
	},
};