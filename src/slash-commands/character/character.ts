import { CommandInteraction } from "discord.js";

import { Command } from "../../command";
import { commandData } from "./commandData"
import { status } from "./subCommands/status";
import { info } from "./subCommands/info";
import { location } from "./subCommands/location";

export const character: Command = {
	cmdData: commandData,
	async execute(commandInteraction: CommandInteraction) {
		console.log(`Executing "${commandInteraction.commandName}" command for user: "${commandInteraction.user.username}"`);

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
			default:
				commandInteraction.reply({ content: `No command found!` })
				break;
		}
	},
};