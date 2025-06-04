import { CommandInteraction } from "discord.js";
import { getCharacter } from "../../../lib/ORM/Character";
// import { Character } from "src/lib/ORM/Character";
import { SubCommand } from "src/subCommand";
import { formatter, ORM_OBJECTS } from "../../../lib/formatter";

export const info: SubCommand = {
	async execute(commandInteraction: CommandInteraction) {
		const username = commandInteraction.options.getString("username") || '';
		const character = await getCharacter(username)
		const reply = formatter[ORM_OBJECTS.CHARACTER]({args: {character, format: 'info'}});
		
		commandInteraction.reply({ content: reply, ephemeral: false });
	},
}

