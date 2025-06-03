import { CommandInteraction } from "discord.js";
import { CharacterLocation } from "../functions/dataFetcher";
import { SubCommand } from "src/subCommand";

export const location: SubCommand = {
	async execute(commandInteraction: CommandInteraction) {
		const charLoc = await CharacterLocation(commandInteraction.user.username);
		commandInteraction.reply({ content: charLoc, ephemeral: false });
	},
}

