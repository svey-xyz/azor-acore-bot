import { CommandInteraction } from "discord.js";
import { CharacterInfo } from "../functions/dataFetcher";
import { SubCommand } from "src/subCommand";

export const info: SubCommand = {
	async execute(commandInteraction: CommandInteraction) {
		const charInfo = await CharacterInfo(commandInteraction.options.getString("username") || '');
		commandInteraction.reply({ content: charInfo, ephemeral: false });
	},
}

