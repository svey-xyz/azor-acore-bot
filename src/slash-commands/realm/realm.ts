import { CommandInteraction } from "discord.js";

import { Command } from "../../command";
import { commandData } from "./commandData"
// import { status } from "./subCommands/status";
// import { characters } from "./subCommands/characters";
// import { online } from "./subCommands/online";

export const character: Command = {
	cmdData: commandData,
	async execute(commandInteraction: CommandInteraction) {
		switch (commandInteraction.options.getSubcommand()) {
			case ('status'):
				// status.execute(commandInteraction);
				break;
			case ('characters'):
				// characters.execute(commandInteraction)
				break;
			case ('online'):
				// online.execute(commandInteraction)
				break;
			default:
				commandInteraction.reply({ content: `No command found!` })
				break;
		}
	},
};