import { CommandInteraction } from "discord.js";
import { SubCommand } from "../../../subCommand";
import { formatter, ORM_OBJECTS } from "../../../lib/formatter";
import { getCharacter } from "../../../lib/ORM/Character";

export const status: SubCommand = {
	async execute(commandInteraction: CommandInteraction) {
		const username = commandInteraction.options.getString("username") || '';
		const character = await getCharacter(username)
		const reply = formatter[ORM_OBJECTS.CHARACTER]({args: {character, format: 'status'}});
				
		commandInteraction.reply({ content: reply, ephemeral: false });
	},
}