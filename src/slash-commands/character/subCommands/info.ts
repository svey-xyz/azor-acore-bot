import { CommandInteraction } from "discord.js";
import { Character } from "src/lib/ORM/Character";
import { SubCommand } from "src/subCommand";

export const info: SubCommand = {
	async execute(commandInteraction: CommandInteraction) {
		const username = commandInteraction.options.getString("username") || '';
		const character = await Character.getCharacter(username)
		
		commandInteraction.reply({ content: character.formatOutput('info'), ephemeral: false });
	},
}

