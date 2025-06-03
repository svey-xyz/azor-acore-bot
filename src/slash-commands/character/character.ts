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
	// async select(selectInteraction: SelectMenuInteraction) {
	// 	const { customId, values, member } = selectInteraction
	// 	const selectCustomID = JSON.parse(customId)
		
	// 	switch (selectCustomID.fn) {
	// 		case ('c'):
	// 			group.selectHandler!(selectInteraction)
	// 			break;
	// 		case ('m'):
	// 			menu.selectHandler!(selectInteraction)
	// 			break;
	// 		default:
	// 			break;
	// 	}
	// },
	// async button(buttonInteraction: ButtonInteraction) {
	// 	const { customId, member } = buttonInteraction
	// 	const selectCustomID = JSON.parse(customId)

	// 	switch (selectCustomID.fn) {
	// 		case ('c'):
	// 			group.buttonHandler!(buttonInteraction)
	// 			break;
	// 		default:
	// 			break;
	// 	}
	// }
};

// module.exports = character;