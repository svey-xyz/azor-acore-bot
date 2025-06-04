import { CommandInteraction } from "discord.js";
import { SubCommand } from "../../../subCommand";
import { characterStatus } from "../functions/dataFetcher";

export const status: SubCommand = {
	async execute(commandInteraction: CommandInteraction) {
		const charOnline = await characterStatus(commandInteraction.options.getString("username") || '');
		commandInteraction.reply({ content: charOnline, ephemeral: false });
	},
}