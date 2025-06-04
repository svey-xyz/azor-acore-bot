import { CommandInteraction } from "discord.js";
import { formatter, ORM_OBJECTS } from "../../../lib/formatter";
import { getCharacter } from "../../../lib/ORM/Character";
import { SubCommand } from "src/subCommand";

export const location: SubCommand = {
	async execute(commandInteraction: CommandInteraction) {
		const username = commandInteraction.options.getString("username") || '';
		const character = await getCharacter(username)
		const reply = formatter[ORM_OBJECTS.CHARACTER]({args: {character, format: 'location'}});
		
		commandInteraction.reply({ content: reply, ephemeral: false });
	},
}

