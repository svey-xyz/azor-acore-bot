import { CommandInteraction } from "discord.js";
import { getCharacter } from "@azor.ORM/Character";
import { SubCommand } from "@azor/subCommand";
import { formatter, ORM_OBJECTS } from "@azor/lib/formatter";

export const info: SubCommand = {
	async execute(commandInteraction: CommandInteraction) {
		const username = commandInteraction.options.getString("username") || '';
		const character = await getCharacter(username)
		const reply = formatter[ORM_OBJECTS.CHARACTER]({args: {character, format: 'info'}});
		
		commandInteraction.reply({ content: reply, ephemeral: false });
	},
}

