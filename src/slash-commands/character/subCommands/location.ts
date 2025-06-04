import { CommandInteraction } from "discord.js";
import { CharacterLocation } from "../functions/dataFetcher";
import { SubCommand } from "src/subCommand";

export const location: SubCommand = {
	async execute(commandInteraction: CommandInteraction) {
		const charLoc = await CharacterLocation(commandInteraction.options.getString("username") || '');
		commandInteraction.reply({ content: charLoc, ephemeral: false });
	},
}

